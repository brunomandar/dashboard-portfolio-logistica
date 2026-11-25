@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
rem ===================================================================
rem  Atualizacao AUTOMATICA do Dashboard Portfolio Logistica - VERSAO 4
rem  - Agendador de Tarefas: 15 em 15 min, 08h-18h (seg a sex)
rem  - Teste manual em qualquer horario: atualizar_dashboard_auto.bat /forcar
rem  - Envio principal: GitHub (origin)
rem  - Espelho corporativo: GitLab (gitlab)
rem  - Log: logs\auto_atualizacao.log
rem ===================================================================
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\auto_atualizacao.log"
set "LOCK=%~dp0logs\auto.lock"
call :log "---- Chamada recebida (versao 4) %~1 ----"
rem --- Janela de horario: 08:00 a 17:59 (ignorada com /forcar)
set "HH=%time:~0,2%"
set "HH=%HH: =0%"
if /i not "%~1"=="/forcar" (
  if %HH% LSS 08 ( call :log "Fora do horario (08h-18h). Nada executado." & exit /b 0 )
  if %HH% GEQ 18 ( call :log "Fora do horario (08h-18h). Nada executado." & exit /b 0 )
)
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
rem --- Git (PATH ou Git do GitHub Desktop)
where git >nul 2>&1
if errorlevel 1 (
  for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do set "PATH=%%d\resources\app\git\cmd;!PATH!"
)
where git >nul 2>&1
if errorlevel 1 ( call :log "ERRO: Git nao encontrado." & goto :fim )
rem --- Python
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )
if not defined PY ( call :log "ERRO: Python nao encontrado." & goto :fim )
rem --- Limpa sobras de rebase/merge
if exist ".git\rebase-merge" rmdir /s /q ".git\rebase-merge"
if exist ".git\rebase-apply" rmdir /s /q ".git\rebase-apply"
if exist ".git\MERGE_HEAD" git merge --abort >>"%LOG%" 2>&1
rem --- 1) Gera os JSONs (-u = log em tempo real; <nul = nao trava em "Pressione Enter")
call :log "Gerando JSONs..."
set "PYTHONIOENCODING=utf-8"
%PY% -u gerar_jsons.py <nul >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: gerar_jsons.py terminou com erro. Veja as linhas acima." )
if not exist "json\projects.index.js" ( call :log "ERRO: JSONs nao gerados. Nada foi enviado." & goto :fim )
call :log "JSONs gerados."
rem --- 2) Commit so se houver mudanca
git add -A >>"%LOG%" 2>&1
git diff --cached --quiet
if not errorlevel 1 (
  call :log "Sem alteracoes nos dados. Nada a enviar."
  goto :fim
)
git commit -m "Atualizacao automatica %date% %time:~0,5%" >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: commit nao foi criado. Nada foi enviado." & goto :fim )
rem --- 3) Sincroniza e envia ao GitHub (fluxo principal)
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: sem conexao com o GitHub (rede?). Envio fica para a proxima rodada." & goto :fim )
git merge origin/main -X ours --no-edit -m "Sincroniza com o GitHub" >>"%LOG%" 2>&1
if errorlevel 1 ( git merge --abort >>"%LOG%" 2>&1 & call :log "ERRO no merge. Nada foi enviado." & goto :fim )
git push origin HEAD:refs/heads/main >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: push para o GitHub falhou. Tenta de novo na proxima rodada." & goto :fim )
call :log "Dashboard atualizado e enviado ao GitHub."
rem --- 4) Espelha o mesmo commit no GitLab corporativo
call :log "Enviando espelho ao GitLab corporativo..."
git push gitlab HEAD:refs/heads/main >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "AVISO: push para o GitLab falhou. GitHub/Cloudflare permanecem atualizados; nova tentativa na proxima rodada."
  goto :fim
)
call :log "Espelho corporativo atualizado no GitLab."
:fim
call :log "==== Fim ===="
del "%LOCK%" >nul 2>&1
powershell -NoProfile -Command "$f='%LOG%'; $l=Get-Content $f -ErrorAction SilentlyContinue; if($l.Count -gt 2000){$l[-2000..-1]|Set-Content $f -Encoding UTF8}" >nul 2>&1
exit /b 0
:log
echo [%date% %time:~0,8%] %~1>>"%LOG%"
exit /b 0
