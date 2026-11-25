@echo off
cd /d "%~dp0"
python app.py serve --port 8765
pause
