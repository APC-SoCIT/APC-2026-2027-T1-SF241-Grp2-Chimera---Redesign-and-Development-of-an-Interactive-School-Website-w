"""Loopback-only preparation workbench. No Supabase or production credentials."""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import hmac
import sqlite3
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from domain import TABLES, fingerprint, integer, minute, shape_error, solve, validate, verify
from workbook import HEADERS, WorkbookInputError, coordinator_demo_data, demo_data, read_workbook, require_valid_workbook_rows
from manual_load import LoadInputError, empty_data, prepare_load
from school_day import coordinator_starting_times, school_cutoff_violations

ROOT = Path(__file__).resolve().parent


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def now():
    return datetime.now(timezone.utc).isoformat()


def workspace_key(data):
    if not isinstance(data, dict):
        raise ValueError('Provide a scheduling dataset.')
    if not all(isinstance(data.get(k), str) and data[k].strip() for k in ['school_year', 'period']):
        raise ValueError('Enter the target school year and period before saving.')
    return fingerprint([data['school_year'].strip(), data['period'].strip()])


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY, data TEXT NOT NULL, revision TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, workspace TEXT NOT NULL, input_hash TEXT NOT NULL,
                    snapshot TEXT NOT NULL, result TEXT NOT NULL, status TEXT NOT NULL,
                    created TEXT NOT NULL, reviewer TEXT, published TEXT);
                CREATE UNIQUE INDEX IF NOT EXISTS one_published ON runs(workspace) WHERE status='published';
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def workspaces(self):
        with self.connect() as db:
            return [dict(id=r['id'], revision=r['revision'], updated=r['updated'],
                         school_year=json.loads(r['data'])['school_year'], period=json.loads(r['data'])['period'])
                    for r in db.execute('SELECT * FROM workspaces ORDER BY updated DESC')]

    def get_workspace(self, key):
        with self.connect() as db:
            row = db.execute('SELECT * FROM workspaces WHERE id=?', (key,)).fetchone()
        if not row:
            raise ValueError('Saved period not found.')
        return dict(id=row['id'], revision=row['revision'], data=json.loads(row['data']))

    def save(self, data, revision):
        error = shape_error(data)
        if error:
            raise ValueError(error)
        key = workspace_key(data)
        if any(row.get('_sheet') in HEADERS for table in TABLES for row in data[table]):
            require_valid_workbook_rows(validate(data)[0])
        serialized = encoded(data)
        new_revision = uuid.uuid4().hex
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision FROM workspaces WHERE id=?', (key,)).fetchone()
            if row and row['revision'] != revision:
                raise Conflict('This period was changed elsewhere. Download your working copy, then reopen the saved period before saving again.')
            db.execute('INSERT OR REPLACE INTO workspaces VALUES (?,?,?,?)', (key, serialized, new_revision, now()))
        return dict(id=key, revision=new_revision)

    def generate(self, key, revision, time_limit):
        current = self.get_workspace(key)
        if current['revision'] != revision:
            raise Conflict('Inputs changed. Reopen the saved period and generate again.')
        data = current['data']
        result = solve(data, time_limit)
        run_id = uuid.uuid4().hex
        state = 'draft' if result.get('verified') else 'failed'
        with self.connect() as db:
            db.execute('INSERT INTO runs (id,workspace,input_hash,snapshot,result,status,created) VALUES (?,?,?,?,?,?,?)',
                       (run_id, key, fingerprint(data), encoded(data), encoded(result), state, now()))
        return self.run(run_id)

    def save_load(self, data, revision, values, editing_id=None, add_requirement=False):
        if not isinstance(values, dict):
            raise LoadInputError({'assignment': 'Provide the teaching-load fields.'})
        count = integer(values.get('section_count', 1), 1, 50)
        if count != 1 and (editing_id or values.get('allocation') != 'auto' or values.get('section')):
            raise LoadInputError({'section_count': 'Multiple sections are available only for a new automatic assignment.'})
        candidate = data
        created = []
        for _ in range(count):
            candidate, load = prepare_load(candidate, values, editing_id, add_requirement)
            created.append(load)
        saved = self.save(candidate, revision)
        return {**saved, 'data': candidate, 'load': load, 'loads': created, 'report': validate(candidate)[0]}

    def runs(self, key):
        with self.connect() as db:
            return [dict(id=r['id'], status=r['status'], solver=json.loads(r['result'])['status'],
                         created=r['created'], reviewer=r['reviewer'], input_hash=r['input_hash'])
                    for r in db.execute('SELECT * FROM runs WHERE workspace=? ORDER BY created DESC', (key,))]

    def run(self, run_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
        if not row:
            raise ValueError('Schedule version not found.')
        snapshot = json.loads(row['snapshot'])
        return dict(id=row['id'], workspace=row['workspace'], status=row['status'],
                    created=row['created'], reviewer=row['reviewer'], published=row['published'],
                    snapshot=snapshot, result=json.loads(row['result']),
                    policy_errors=[v['message'] for v in school_cutoff_violations(snapshot, minute)])

    def publish(self, run_id, reviewer):
        if not isinstance(reviewer, str) or not reviewer.strip():
            raise ValueError('Enter the coordinator/reviewer name for the local review record.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
            if not row or row['status'] != 'draft':
                raise ValueError('Only a verified draft can be published.')
            current = db.execute('SELECT data FROM workspaces WHERE id=?', (row['workspace'],)).fetchone()
            data, result = json.loads(row['snapshot']), json.loads(row['result'])
            if data.get('trial'):
                raise ValueError('A provisional trial cannot be published. Prepare school-confirmed inputs and generate a new version.')
            if not current or fingerprint(json.loads(current['data'])) != row['input_hash']:
                raise Conflict('This draft is stale. Generate a new version from the current inputs.')
            if not data.get('confirmed'):
                raise ValueError('Confirm the curriculum, bell times, workload and availability before generating a publishable draft.')
            if (fingerprint(data) != row['input_hash'] or result.get('input_hash') != row['input_hash']
                    or result.get('status') not in ['FEASIBLE', 'OPTIMAL'] or not result.get('verified')):
                raise ValueError('The saved draft failed independent verification. Generate a new version.')
            errors = verify(data, result.get('entries', []), result.get('activities', []),
                            require_workload_approval=True)
            if errors:
                raise ValueError('The saved draft failed independent verification. ' + errors[0])
            db.execute("UPDATE runs SET status='superseded' WHERE workspace=? AND status='published'", (row['workspace'],))
            db.execute("UPDATE runs SET status='published',reviewer=?,published=? WHERE id=?", (reviewer.strip(), now(), run_id))
        return self.run(run_id)

    def published(self, key):
        with self.connect() as db:
            row = db.execute("SELECT id FROM runs WHERE workspace=? AND status='published'", (key,)).fetchone()
        run = self.run(row['id']) if row else None
        return run if run and not run['policy_errors'] else None


def make_server(store, port=8765, gateway_secret=None):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'SNCSLocal/1'

        def log_message(self, fmt, *args):
            pass  # Do not log teacher data or query strings.

        def trusted(self, mutation=False):
            if gateway_secret and not hmac.compare_digest(self.headers.get('X-SNCS-Gateway', ''), gateway_secret):
                raise PermissionError('Open scheduling through the Academic Coordinator staff portal.')
            expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            host = self.headers.get('Host', '')
            origin = self.headers.get('Origin')
            if host not in expected or (origin and origin != 'http://' + host):
                raise PermissionError('Open this workbench using its localhost URL.')
            if mutation and self.headers.get('X-SNCS-Local') != '1':
                raise PermissionError('Use the local workbench to change scheduling data.')

        def respond(self, value, status=200, content_type='application/json; charset=utf-8', filename=None):
            payload = encoded(value).encode('utf-8') if content_type.startswith('application/json') else value
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'")
            if filename:
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(payload)

        def guarded(self, action):
            try:
                action()
            except WorkbookInputError as exc:
                self.respond({'error': str(exc), 'issues': exc.issues}, 422)
            except LoadInputError as exc:
                self.respond({'error': str(exc), 'fields': exc.fields}, 422)
            except Conflict as exc:
                self.respond({'error': str(exc)}, 409)
            except PermissionError as exc:
                self.respond({'error': str(exc)}, 403)
            except (ValueError, KeyError, TypeError, OverflowError) as exc:
                self.respond({'error': str(exc) or 'Invalid scheduling input.'}, 400)
            except Exception as exc:
                print('Request failed:', type(exc).__name__, file=sys.stderr)
                self.respond({'error': 'The local request failed. Your saved versions have been preserved.'}, 500)

        def do_GET(self):
            self.guarded(self.get)

        def get(self):
            self.trusted()
            url = urlparse(self.path)
            args = parse_qs(url.query)
            key = args.get('id', [''])[0]
            if url.path in ['/', '/app.js', '/style.css', '/timetable.js', '/timetable.css', '/workspace.js', '/workspace.css']:
                name = 'index.html' if url.path == '/' else url.path[1:]
                mime = 'text/html' if name.endswith('.html') else 'text/javascript' if name.endswith('.js') else 'text/css'
                self.respond((ROOT / 'web' / name).read_bytes(), content_type=mime + '; charset=utf-8')
            elif url.path == '/api/health':
                self.respond({'status': 'ready', 'service': 'scheduler'})
            elif url.path == '/api/workspaces':
                self.respond(store.workspaces())
            elif url.path == '/api/workspace':
                self.respond(store.get_workspace(key))
            elif url.path == '/api/demo':
                self.respond(coordinator_demo_data())
            elif url.path == '/api/empty':
                self.respond(empty_data())
            elif url.path == '/api/coordinator-times':
                self.respond(coordinator_starting_times())
            elif url.path == '/api/runs':
                self.respond(store.runs(key))
            elif url.path == '/api/run':
                self.respond(store.run(key))
            elif url.path == '/api/published':
                self.respond(store.published(key))
            elif url.path == '/api/export':
                run = store.run(key)
                if args.get('format') == ['csv']:
                    if run['policy_errors']:
                        raise ValueError('This historical result exceeds the confirmed 5:00 PM cutoff. Generate a new schedule from corrected inputs.')
                    stream = io.StringIO(newline='')
                    writer = csv.writer(stream)
                    fields = ['load', 'teacher', 'subject', 'section', 'strand', 'day', 'start', 'end']
                    writer.writerow(fields)
                    for entry in run['result']['entries']:
                        values = []
                        for field in fields:
                            value = str(entry[field])
                            if field in ['start', 'end']:
                                value = f'{entry[field] // 60:02}:{entry[field] % 60:02}'
                            if value.lstrip().startswith(('=', '+', '-', '@')):
                                value = "'" + value
                            values.append(value)
                        writer.writerow(values)
                    self.respond(stream.getvalue().encode('utf-8-sig'), content_type='text/csv; charset=utf-8', filename='schedule.csv')
                else:
                    self.respond(run, filename='schedule-version.json')
            else:
                self.respond({'error': 'Page not found.'}, 404)

        def do_POST(self):
            self.guarded(self.post)

        def post(self):
            self.trusted(mutation=True)
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 5 * 1024 * 1024:
                raise ValueError('The request must contain at most 5 MB.')
            body = self.rfile.read(size)
            path = urlparse(self.path).path
            if path == '/api/import':
                data = read_workbook(body)
                report, _ = validate(data)
                require_valid_workbook_rows(report)
                self.respond({'data': data, 'report': report})
                return
            if not self.headers.get('Content-Type', '').startswith('application/json'):
                raise ValueError('Use a JSON request.')
            payload = json.loads(body, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Non-finite numbers are not allowed.')))
            if not isinstance(payload, dict):
                raise ValueError('The request must be a JSON object.')
            if path == '/api/save':
                # Scheduling-readiness errors can be saved for correction; invalid workbook rows cannot.
                self.respond(store.save(payload['data'], payload.get('revision')))
            elif path == '/api/manual-load':
                self.respond(store.save_load(payload['data'], payload.get('revision'), payload['load'],
                                             payload.get('editing_id'), payload.get('add_requirement', False)))
            elif path == '/api/validate':
                self.respond(validate(payload['data'])[0])
            elif path == '/api/generate':
                self.respond(store.generate(payload['id'], payload['revision'], payload.get('seconds', 10)))
            elif path == '/api/publish':
                self.respond(store.publish(payload['id'], payload.get('reviewer', '')))
            else:
                self.respond({'error': 'API route not found.'}, 404)

    # This deliberately cannot be exposed to the network via a --host flag.
    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    serve = sub.add_parser('serve')
    serve.add_argument('--port', type=int, default=8765)
    serve.add_argument('--db', type=Path, default=ROOT / '.local' / 'scheduler.sqlite3')
    serve.add_argument('--gateway', action='store_true', help='Require the staff API gateway secret on every request.')
    check = sub.add_parser('check')
    check.add_argument('file', type=Path)
    check.add_argument('--school-year', required=True)
    check.add_argument('--period', required=True)
    check.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.command == 'check':
        data = read_workbook(args.file.read_bytes())
        data.update(school_year=args.school_year, period=args.period)
        report, _ = validate(data)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(encoded(report), encoding='utf-8')
        print(encoded({'counts': report['counts'], 'errors': len(report['errors']),
                       'warnings': len(report['warnings']), 'first_errors': report['errors'][:12]}))
        return 1 if report['errors'] else 0
    gateway_secret = os.environ.get('SCHEDULER_INTERNAL_SECRET') if args.gateway else None
    if args.gateway and (not gateway_secret or len(gateway_secret) < 32):
        parser.error('Gateway mode requires SCHEDULER_INTERNAL_SECRET with at least 32 characters.')
    server = make_server(Store(args.db), args.port, gateway_secret)
    print(f'Local scheduling workbench: http://127.0.0.1:{server.server_port}', flush=True)
    print('Staff gateway mode: direct access requires the internal secret.' if args.gateway else
          'Standalone local preview; open the staff portal for coordinator authentication.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
