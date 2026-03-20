@echo off
setlocal EnableExtensions DisableDelayedExpansion

REM ================== CONFIG ==================
set "BRANCH=master"
set "COMPOSE_FILE=docker-compose.yml"
set "DEPLOY_CMD=docker compose -f %COMPOSE_FILE% up -d --build"
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

REM ----- Verifica Git -----
git --version >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Git nao encontrado no PATH.
  exit /b 1
)

REM ----- Verifica Docker -----
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Docker nao esta rodando. Inicie o Docker Desktop/daemon.
  exit /b 1
)

REM ----- Repo git? -----
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Este diretorio nao parece ser um repositorio Git.
  exit /b 1
)

echo Branch alvo: %BRANCH%
set "resp="
set /p "resp=Deseja rodar o deploy na branch %BRANCH%? (s/n): "
if /i not "%resp%"=="s" (
  echo Deploy cancelado pelo usuario.
  exit /b 0
)

echo.
echo === GIT: checkout + pull ===
git fetch
if errorlevel 1 goto fail

git checkout %BRANCH%
if errorlevel 1 goto fail

git pull
if errorlevel 1 goto fail

echo.
echo === DEPLOY COM DOCKER ===
echo Comando: %DEPLOY_CMD%
%DEPLOY_CMD%
if errorlevel 1 goto fail

echo.
echo === STATUS (docker compose ps) ===
docker compose -f %COMPOSE_FILE% ps

echo.
echo =====================================
echo   Verificacao de deploy
echo =====================================
echo Frontend: http://localhost:%WEB_PORT%
echo API: http://localhost:%API_PORT%
echo Logs API: docker compose -f %COMPOSE_FILE% logs -f api
echo.

set "ok="
set /p "ok=Os containers estao rodando corretamente? (s/n): "
if /i not "%ok%"=="s" (
  echo Ok, abortando antes de qualquer push.
  exit /b 0
)

echo.
set "doPush="
set /p "doPush=Deseja fazer commit e push agora? (s/n): "
if /i not "%doPush%"=="s" (
  echo Deploy feito. Sem push.
  exit /b 0
)

REM ----- Se nao ha alteracoes para commit, tenta push -----
git diff --quiet
set "hasWork=%errorlevel%"
git diff --cached --quiet
set "hasStage=%errorlevel%"

if "%hasWork%"=="0" if "%hasStage%"=="0" (
  echo Nao ha alteracoes para commit.
  goto onlypush
)

echo.
set "msg="
set /p "msg=Digite a mensagem do commit: "
if "%msg%"=="" (
  echo [ERRO] Mensagem vazia. Cancelando.
  exit /b 1
)

echo.
echo === GIT: add ===
git add .
if errorlevel 1 goto fail

REM ----- Commit seguro com arquivo temporario -----
set "MSGFILE=%TEMP%\gitmsg_%RANDOM%%RANDOM%.txt"
> "%MSGFILE%" (
  echo %msg%
)

echo.
echo === GIT: commit ===
git commit -F "%MSGFILE%"
set "c=%errorlevel%"
del /f /q "%MSGFILE%" >nul 2>&1
if not "%c%"=="0" goto fail

:onlypush
echo.
echo === GIT: push ===
git push
if errorlevel 1 goto fail

echo.
echo =====================================
echo OK: Deploy + Push concluido
echo =====================================
exit /b 0

:fail
echo.
echo =====================================
echo FALHOU. Abortando.
echo =====================================
echo Dicas:
echo  - Logs API: docker compose -f %COMPOSE_FILE% logs --tail=200 api
echo  - Reiniciar: docker compose -f %COMPOSE_FILE% down ^&^& docker compose -f %COMPOSE_FILE% up -d --build
echo.
exit /b 1
