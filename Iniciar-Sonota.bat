@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instale o Node.js 24 LTS e abra este arquivo novamente.
  pause
  exit /b 1
)
node -e "if (process.versions.node.split('.')[0] !== '24') process.exit(1)"
if errorlevel 1 (
  echo Este projeto precisa do Node.js 24 LTS.
  pause
  exit /b 1
)
if not exist node_modules\express (
  echo Instalando dependencias do backend...
  call npm ci
  if errorlevel 1 goto :erro
)
if not exist mobile\node_modules\@ionic\angular (
  echo Instalando Ionic + Angular...
  call npm --prefix mobile install
  if errorlevel 1 goto :erro
)
echo Compilando a interface Ionic + Angular...
call npm run ui:build
if errorlevel 1 goto :erro
echo.
echo Sonota pronto. Abra http://localhost:3000
call npm start
pause
exit /b 0
:erro
echo.
echo Nao foi possivel preparar o Sonota. Confira a conexao e o erro acima.
pause
exit /b 1
