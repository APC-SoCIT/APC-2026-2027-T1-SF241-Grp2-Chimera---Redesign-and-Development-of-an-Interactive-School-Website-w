const {test} = require('node:test');
const assert = require('node:assert/strict');
const sandbox = {module:{exports:{}}};
require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'web/timetable.js'),'utf8'),sandbox);
const {model,html,entities,clock} = sandbox.module.exports;
function fixture() {
  return {id:'test-version',status:'draft',snapshot:{school_year:'2026-2027',period:'TEST',demo:true,
    teachers:[{id:'T1',name:'Teacher <One>'},{id:'T2',name:'Teacher Two'},{id:'T3',name:'Unassigned'}],
    sections:[{id:'S1',grade:11,strands:'A,B'},{id:'S2',grade:7}],
    loads:[{subject:'Mathematics'},{subject:'Science'}],
    bells:[{group:'11-12',days:'Mon-Fri',kind:'Lunch',label:'Lunch',start:'12:00',end:'13:00'}]},
    result:{entries:[
      {load:'L1',teacher:'T1',section:'S1',subject:'Mathematics',strand:'A',day:'Mon',start:435,end:480},
      {load:'L2',teacher:'T2',section:'S1',subject:'Science',strand:'B',day:'Mon',start:435,end:495},
      {load:'L3',teacher:'T1',section:'S2',subject:'Mathematics',strand:'',day:'Tue',start:495,end:555},
    ]}};
}
test('teacher and section views preserve each generated meeting exactly once',() => {
  const v = fixture();
  for (const type of ['teacher','section']) {
    const loads = entities(v,type).flatMap(e => model(v,type,e.id).entries.map(l => l.load));
    assert.deepEqual(Array.from(loads).sort(),v.result.entries.map(e => e.load).sort());
  }
});
test('real clock offsets, 45-minute lengths and touching intervals remain accurate',() => {
  const v = fixture();
  v.result.entries.push({...v.result.entries[0],load:'L4',start:495,end:540});
  const m = model(v,'section','S1');
  assert.equal(m.start,420);
  assert.equal(m.end,780);
  const rows = m.columns[0].entries;
  assert.equal(rows[0].end-rows[0].start,45);
  assert.equal(rows[0].lanes,2);
  assert.equal(rows[1].lanes,2);
  assert.equal(rows[2].lanes,1);
  assert.equal(rows[0].lane,0);
  assert.equal(rows[1].lane,1);
  assert.equal(clock(720),'12:00 PM');
});
test('Saturday is included when used; breaks belong to the selected grade group',() => {
  const v = fixture();
  assert.equal(model(v,'section','S1').days.length,5);
  v.result.entries[0].day = 'Sat';
  assert.equal(model(v,'teacher','T1').days.length,6);
  assert.equal(model(v,'section','S1').columns[0].breaks.length,1);
  assert.equal(model(v,'section','S2').columns[0].breaks.length,0);
  assert.equal(model(v,'teacher','T1').columns[0].breaks.length,0);
});
test('unassigned records are visible and labels are escaped',() => {
  const v = fixture();
  assert.equal(entities(v,'teacher').length,3);
  assert.match(html(v,'teacher','T3'),/No lessons assigned/);
  assert.match(html(v,'teacher','T1'),/Teacher &lt;One&gt;/);
  assert.match(html(v,'section','S1'),/data-lanes="2"/);
  assert.throws(() => model(v,'teacher','missing'));
});
test('adviser activities appear in both projections and morning/afternoon views use their own hours',() => {
  const v=fixture();
  v.snapshot.day_plans=[{group:'11'}];
  v.result.activities=[{section:'S1',advisers:'T1,T2',day:'Mon',kind:'Morning routines',start:390,end:420},
    {section:'S1',advisers:'T1,T2',day:'Mon',kind:'Dismissal',start:780,end:790}];
  assert.equal(model(v,'teacher','T1').activities.length,2);
  assert.equal(model(v,'teacher','T3').activities.length,0);
  assert.equal(model(v,'section','S1').start,390);
  assert.match(html(v,'section','S1'),/Morning routines/);
  assert.equal(model(v,'section','S2').activities.length,0);
});
test('co-adviser homeroom supervision is visible to that teacher without duplicating the class lesson',() => {
  const v=fixture();
  v.result.activities=[{section:'S1',advisers:'T2',day:'Mon',kind:'Homeroom supervision',start:435,end:480,teacher_only:true}];
  assert.equal(model(v,'teacher','T2').activities.length,1);
  assert.equal(model(v,'section','S1').activities.length,0);
  assert.match(html(v,'teacher','T2'),/Homeroom supervision/);
});
test('real-load trial pages remain visibly labeled as provisional',() => {
  const v=fixture();v.snapshot.demo=false;v.snapshot.trial=true;
  assert.match(html(v,'teacher','T1'),/TRIAL · DRAFT/);
  assert.match(html(v,'section','S1'),/not school-approved/);
});
