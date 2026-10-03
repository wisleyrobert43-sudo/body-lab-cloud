@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js LTS e tente novamente.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try {$c=New-Object Net.Sockets.TcpClient('127.0.0.1',8080);$c.Close();exit 1}catch{exit 0}"
if errorlevel 1 (
  echo.
  echo A porta 8080 ja esta ocupada. Feche a janela preta do Body Lab antigo.
  echo Se necessario, aperte Ctrl+C naquela janela antes de abrir esta versao.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Abra o .env e substitua COLE_SUA_CHAVE_OPENROUTER_AQUI por sua chave.
  notepad .env
  echo Depois de salvar, pressione qualquer tecla para continuar.
  pause >nul
)
if not exist node_modules (
  echo Instalando dependencias na primeira execucao...
  call npm install
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
echo BODY LAB OPENROUTER - esta janela precisa ficar aberta.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8080"
node server.js
pause
