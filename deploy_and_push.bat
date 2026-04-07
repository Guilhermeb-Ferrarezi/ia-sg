@echo off
setlocal EnableExtensions DisableDelayedExpansion

REM ================== CONFIG ==================
set "BRANCH=master"
set "COMPOSE_FILE=docker-compose.yml"
set "WEB_PORT=8085"
set "API_PORT=3005"
REM ============================================

color 0A
echo.
echo =====================================
echo   DEPLOY - IA SG
echo =====================================
echo.

REM ----- Garante execucao na pasta do script -----
cd /d "%~dp0"

REM ----- Le portas opcionais do .env -----
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="IA_SG_WEB_PORT" if not "%%B"=="" set "WEB_PORT=%%B"
    if /i "%%A"=="IA_SG_API_PORT" if not "%%B"=="" set "API_PORT=%%B"
  )
)

REM ----- Verifica Docker -----
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Docker nao esta rodando. Inicie o Docker Desktop.
  exit /b 1
)

REM ----- Verifica Git -----
git --version >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Git nao encontrado no PATH.
  exit /b 1
)

REM ----- Repo git? -----
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Este diretorio nao e um repositorio Git.
  exit /b 1
)

echo [1/3] Deploy com Docker Compose...
docker compose -f %COMPOSE_FILE% up -d --build
if errorlevel 1 goto fail

echo.
echo === STATUS ===
docker compose -f %COMPOSE_FILE% ps

echo.
echo =====================================
echo   Deploy concluido com sucesso!
echo   Frontend : http://localhost:%WEB_PORT%
echo   API      : http://localhost:%API_PORT%
echo =====================================
echo.

REM ----- Pergunta sobre commit + push -----
set "doPush="
set /p "doPush=Deseja fazer commit e push agora? (s/n): "
if /i not "%doPush%"=="s" (
  echo Sem push. Pronto.
  exit /b 0
)

echo.
echo [2/3] Verificando alteracoes Git...

git diff --quiet
set "hasWork=%errorlevel%"
git diff --cached --quiet
set "hasStage=%errorlevel%"

if "%hasWork%"=="0" if "%hasStage%"=="0" (
  echo Sem alteracoes locais. Fazendo apenas push...
  goto onlypush
)

echo.
set "msg="
set /p "msg=Mensagem do commit: "
if "%msg%"=="" (
  echo [ERRO] Mensagem vazia. Cancelando push.
  exit /b 1
)

echo.
echo [3/3] Commitando e enviando...
git add .
if errorlevel 1 goto fail

set "MSGFILE=%TEMP%\gitmsg_%RANDOM%%RANDOM%.txt"
> "%MSGFILE%" (
  echo %msg%
)

git commit -F "%MSGFILE%"
set "c=%errorlevel%"
del /f /q "%MSGFILE%" >nul 2>&1
if not "%c%"=="0" goto fail

:onlypush
git push
if errorlevel 1 goto fail

echo.
echo =====================================
echo   OK: Deploy + Push concluido!
echo =====================================
exit /b 0

:fail
echo.
echo =====================================
echo   FALHOU. Veja os logs abaixo:
echo   docker compose -f %COMPOSE_FILE% logs --tail=100 api
echo =====================================
echo.
exit /b 1
