@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Atualizar Dashboard - Portfolio Logistica
echo ============================================================
echo  1/3  Gerando JSONs a partir dos Excel dos projetos
echo ============================================================
where python >nul 2>&1
if errorlevel 1 (
  echo ERRO: Python nao encontrado. Instale pelo Portal da Empresa / python.org e marque "Add to PATH".
  pause & exit /b 1
)
python -c "import openpyxl" >nul 2>&1 || python -m pip install --user openpyxl
python gerar_jsons.py
if errorlevel 1 (
  echo.
  echo Geracao interrompida. Nada foi enviado ao GitHub ou GitLab.
  pause & exit /b 1
)
echo.
echo ============================================================
echo  2/3  Localizando o Git
echo ============================================================
set "GIT=git"
where git >nul 2>&1
if errorlevel 1 (
  set "GIT="
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
)
if not defined GIT (
  echo Git nao encontrado. Abra o GitHub Desktop e faca Commit + Push manualmente.
  pause & exit /b 0
)
echo.
echo ============================================================
echo  3/3  Enviando para GitHub e GitLab corporativo
echo ============================================================
"%GIT%" pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo ERRO ao sincronizar com o GitHub. Nenhum envio foi realizado.
  pause & exit /b 1
)
"%GIT%" add -A json MANIFESTO.txt
"%GIT%" diff --cached --quiet
if not errorlevel 1 (
  echo Nenhuma alteracao nos dados. Nada para enviar.
  pause & exit /b 0
)
"%GIT%" commit -m "Atualizacao de dados %date% %time:~0,5%"
if errorlevel 1 (
  echo.
  echo ERRO ao criar o commit. Nada foi enviado.
  pause & exit /b 1
)
"%GIT%" push origin HEAD:refs/heads/main
if errorlevel 1 (
  echo.
  echo ERRO no envio ao GitHub. Abra o GitHub Desktop e verifique o repositorio.
  pause & exit /b 1
)
echo GitHub atualizado com sucesso.
"%GIT%" push gitlab HEAD:refs/heads/main
if errorlevel 1 (
  echo.
  echo AVISO: GitHub/Cloudflare foram atualizados, mas o espelho no GitLab falhou.
  echo Verifique a rede corporativa, o token e o remoto gitlab.
  pause & exit /b 1
)
echo GitLab corporativo atualizado com sucesso.
echo.
echo Pronto! Aguarde 1 a 2 minutos e clique em "Atualizar dados" no dashboard.
pause
