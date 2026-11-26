@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\github_atualizacao.log"
set "LOCK=%~dp0logs\github_auto.lock"
call :log "---- GitHub: chamada recebida %~1 ----"
set "HH=%time:~0,2%"
set "HH=%HH: =0%"
if /i not "%~1"=="/forcar" (
  if %HH% LSS 08 ( call :log "Fora do horario 08h-18h." & exit /b 0 )
  if %HH% GEQ 18 ( call :log "Fora do horario 08h-18h." & exit /b 0 )
)
if exist "%LOCK%" (
  powershell -NoProfile -Command "if(((Get-Date)-(Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 10){exit 1}else{exit 0}" >nul 2>&1
  if errorlevel 1 ( call :log "Execucao GitHub anterior ainda em andamento. Pulando." & exit /b 0 )
  call :log "Trava GitHub antiga removida."
  del "%LOCK%" >nul 2>&1
)
echo %date% %time%>"%LOCK%"
call :log "==== Inicio GitHub ===="
where git >nul 2>&1
if errorlevel 1 for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do set "PATH=%%d\resources\app\git\cmd;!PATH!"
where git >nul 2>&1
if errorlevel 1 ( call :log "ERRO: Git nao encontrado." & goto :fim )
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )
if not defined PY ( call :log "ERRO: Python nao encontrado." & goto :fim )
call :log "Gerando JSONs para GitHub..."
set "PYTHONIOENCODING=utf-8"
%PY% -u gerar_jsons.py <nul >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: gerar_jsons.py falhou." & goto :fim )
if not exist "json\projects.index.js" ( call :log "ERRO: JSONs nao gerados." & goto :fim )
call :log "JSONs gerados."
git add -A json MANIFESTO.txt >>"%LOG%" 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Atualizacao automatica GitHub %date% %time:~0,5%" >>"%LOG%" 2>&1
  if errorlevel 1 ( call :log "ERRO: commit GitHub falhou." & goto :fim )
) else (
  call :log "Sem alteracoes novas; verificando sincronizacao."
)
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: GitHub indisponivel. Tenta novamente na proxima rodada." & goto :fim )
git merge origin/main -X ours --no-edit -m "Sincroniza com GitHub" >>"%LOG%" 2>&1
if errorlevel 1 ( git merge --abort >>"%LOG%" 2>&1 & call :log "ERRO no merge do GitHub." & goto :fim )
git push origin HEAD:refs/heads/main >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: push GitHub falhou." & goto :fim )
call :log "GitHub atualizado com sucesso."
:fim
call :log "==== Fim GitHub ===="
del "%LOCK%" >nul 2>&1
exit /b 0
:log
echo [%date% %time:~0,8%] %~1>>"%LOG%"
exit /b 0
