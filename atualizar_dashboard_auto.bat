@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
rem ===================================================================
rem  Atualizacao AUTOMATICA do Dashboard Portfolio Logistica - VERSAO 5
rem  - Agendador de Tarefas: 15 em 15 min, 08h-18h (seg a sex)
rem  - Teste manual em qualquer horario: atualizar_dashboard_auto.bat /forcar
rem  - Fonte central: GitLab corporativo (remoto "gitlab")
rem  - GitHub (remoto "origin"): copia opcional, so quando a rede permitir
rem  - Log: logs\auto_atualizacao.log
rem ===================================================================
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\auto_atualizacao.log"
set "LOCK=%~dp0logs\auto.lock"
call :log "---- Chamada recebida (versao 5) %~1 ----"
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
rem --- 2) Commit so se houver mudanca (sem mudanca, segue para enviar pendencias)
git add -A >>"%LOG%" 2>&1
git diff --cached --quiet
if not errorlevel 1 (
  call :log "Sem alteracoes novas nos dados. Verificando envios pendentes."
) else (
  git commit -m "Atualizacao automatica %date% %time:~0,5%" >>"%LOG%" 2>&1
  if errorlevel 1 ( call :log "ERRO: commit nao foi criado. Nada foi enviado." & goto :fim )
)
rem --- 3) GitLab corporativo = FONTE CENTRAL
git fetch gitlab >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: sem conexao com o GitLab. Envio fica para a proxima rodada." & goto :github )
git merge gitlab/main -X ours --no-edit -m "Sincroniza com o GitLab" >>"%LOG%" 2>&1
if errorlevel 1 ( git merge --abort >>"%LOG%" 2>&1 & call :log "ERRO no merge com o GitLab. Nada foi enviado ao GitLab." & goto :github )
git push gitlab HEAD:refs/heads/main >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: push para o GitLab falhou. Tenta de novo na proxima rodada." & goto :github )
call :log "GitLab corporativo atualizado (fonte central)."
:github
rem --- 4) GitHub = copia OPCIONAL (bloqueado na rede Claro; funciona fora dela)
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "GitHub indisponivel nesta rede. Ignorado (esperado na rede Claro)." & goto :fim )
git merge origin/main -X ours --no-edit -m "Sincroniza com o GitHub" >>"%LOG%" 2>&1
if errorlevel 1 ( git merge --abort >>"%LOG%" 2>&1 & call :log "AVISO: merge com o GitHub falhou. GitHub nao atualizado." & goto :fim )
git push origin HEAD:refs/heads/main >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "AVISO: push para o GitHub falhou." & goto :fim )
call :log "Copia no GitHub tambem atualizada."
:fim
call :log "==== Fim ===="
del "%LOCK%" >nul 2>&1
powershell -NoProfile -Command "$f='%LOG%'; $l=Get-Content $f -ErrorAction SilentlyContinue; if($l.Count -gt 2000){$l[-2000..-1]|Set-Content $f -Encoding UTF8}" >nul 2>&1
exit /b 0
:log
echo [%date% %time:~0,8%] %~1>>"%LOG%"
exit /b 0
