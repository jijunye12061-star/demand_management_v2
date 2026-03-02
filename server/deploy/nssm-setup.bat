@echo off
REM Install OpenSpec backend as Windows service using NSSM
REM Download NSSM from https://nssm.cc/

set SERVICE_NAME=OpenSpec-API
set PYTHON_PATH=C:\Python312\python.exe
set APP_DIR=C:\opt\openspec\server

nssm install %SERVICE_NAME% %PYTHON_PATH% -m uvicorn app.main:app --host 0.0.0.0 --port 8000
nssm set %SERVICE_NAME% AppDirectory %APP_DIR%
nssm set %SERVICE_NAME% AppStdout %APP_DIR%\logs\stdout.log
nssm set %SERVICE_NAME% AppStderr %APP_DIR%\logs\stderr.log
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760

echo Service %SERVICE_NAME% installed. Start with: nssm start %SERVICE_NAME%
