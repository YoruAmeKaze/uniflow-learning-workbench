@echo off
setlocal
pushd "%~dp0"
set "BACKEND=backend"
set "FRONTEND=frontend"

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo Created .env from .env.example. Fill in model API settings if needed.
)

if not exist "%BACKEND%\node_modules" (
  echo Installing backend dependencies...
  call npm --prefix "%BACKEND%" install
  if errorlevel 1 goto :error
)
if not exist "%FRONTEND%\node_modules" (
  echo Installing frontend dependencies...
  call npm --prefix "%FRONTEND%" install
  if errorlevel 1 goto :error
)

rem Use /D to set each child window working directory.
start "UniFlow Backend" /D "%BACKEND%" "%ComSpec%" /k "npm run start:dev"
start "UniFlow Frontend" /D "%FRONTEND%" "%ComSpec%" /k "npm run dev"

echo.
echo UniFlow demo is starting.
echo Frontend: http://127.0.0.1:5173
echo Backend health: http://127.0.0.1:8000/health
echo Demo student id: 2026000001
echo Demo password: UniFlowDemo2026!
pause
popd
exit /b 0

:error
echo Dependency installation failed. Check Node.js and network access.
pause
popd
exit /b 1
