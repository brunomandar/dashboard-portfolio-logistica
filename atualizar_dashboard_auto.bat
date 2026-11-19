@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
rem ===================================================================
rem  Atualizacao AUTOMATICA do Dashboard Portfolio Logistica
rem  - Roda sozinho pelo Agendador de Tarefas (15 em 15 min, 08h-18h)
rem  - Gera os JSONs (gerar_jsons.py) e envia ao GitHub so se algo mudou
rem  - Nao tem "pause": nunca fica parado esperando tecla
rem  - Registra tudo em logs\auto_atualizacao.log
rem  - NAO substitui o atualizar_dashboard.bat (manual), que continua igual
rem ===================================================================
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\auto_atualizacao.log"
set "LOCK=%~dp0logs\auto.lock"

rem --- Janela de horario (seguranca extra): so roda entre 08:00 e 17:59
set "HH=%time:~0,2%"
set "HH=%HH: =0%"
if %HH% LSS 08 exit /b 0
if %HH% GEQ 18 exit /b 0

rem --- Evita duas execucoes ao mesmo tempo (trava expira em 30 min)
if exist "%LOCK%" (
  powershell -NoProfile -Command "if(((Get-Date)-(Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30){exit 1}else{exit 0}" >nul 2>&1
  if errorlevel 1 (
    call :log "Execucao anterior ainda em andamento. Pulando."
    exit /b 0
  )
  call :log "Trava antiga (mais de 30 min) removida."
)
echo %date% %time%>"%LOCK%"
call :log "==== Inicio ===="

rem --- Localiza o Git (PATH ou o Git do GitHub Desktop)
where git >nul 2>&1
if errorlevel 1 (
  for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do set "PATH=%%d\resources\app\git\cmd;!PATH!"
)
where git >nul 2>&1
if errorlevel 1 ( call :log "ERRO: Git nao encontrado." & goto :fim )

rem --- Localiza o Python
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )
if not defined PY ( call :log "ERRO: Python nao encontrado." & goto :fim )

rem --- Limpa sobras de rebase/merge interrompidos
if exist ".git\rebase-merge" rmdir /s /q ".git\rebase-merge"
if exist ".git\rebase-apply" rmdir /s /q ".git\rebase-apply"
if exist ".git\MERGE_HEAD" git merge --abort >>"%LOG%" 2>&1

rem --- 1) Gera os JSONs
rem     -u  = grava o andamento no log na hora (sem buffer)
rem     <nul = se o script pedir "Pressione Enter" (input), responde sozinho e nao trava
call :log "Gerando JSONs..."
set "PYTHONIOENCODING=utf-8"
%PY% -u gerar_jsons.py <nul >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO ao gerar JSONs (ou o script terminou pedindo Enter). Veja as linhas acima." )
if not exist "json\projects.index.js" ( call :log "ERRO: JSONs nao gerados. Nada foi enviado." & goto :fim )
call :log "JSONs gerados."

rem --- 2) So faz commit se houver mudanca
git add -A >>"%LOG%" 2>&1
git diff --cached --quiet
if not errorlevel 1 (
  call :log "Sem alteracoes nos dados. Nada a enviar."
  goto :fim
)
git commit -m "Atualizacao automatica %date% %time:~0,5%" >>"%LOG%" 2>&1

rem --- 3) Sincroniza com o GitHub (mantem a versao do PC em conflito) e envia
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: sem conexao com o GitHub (rede?). Envio fica para a proxima rodada." & goto :fim )
git merge origin/main -X ours --no-edit -m "Sincroniza com o GitHub" >>"%LOG%" 2>&1
if errorlevel 1 ( git merge --abort >>"%LOG%" 2>&1 & call :log "ERRO no merge. Nada foi enviado." & goto :fim )
git push origin main >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: push falhou. Tenta de novo na proxima rodada." & goto :fim )
call :log "Dashboard atualizado e enviado ao GitHub."

:fim
call :log "==== Fim ===="
del "%LOCK%" >nul 2>&1
rem Mantem o log com no maximo ~2000 linhas
powershell -NoProfile -Command "$f='%LOG%'; $l=Get-Content $f -ErrorAction SilentlyContinue; if($l.Count -gt 2000){$l[-2000..-1]|Set-Content $f -Encoding UTF8}" >nul 2>&1
exit /b 0

:log
echo [%date% %time:~0,8%] %~1>>"%LOG%"
exit /b 0
