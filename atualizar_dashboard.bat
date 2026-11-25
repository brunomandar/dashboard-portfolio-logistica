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
  echo Geracao interrompida. Nada foi enviado.
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
  echo Git nao encontrado.
  pause & exit /b 1
)
echo.
echo ============================================================
echo  3/3  Enviando para o GitLab corporativo - fonte central
echo ============================================================
"%GIT%" add -A json MANIFESTO.txt
"%GIT%" diff --cached --quiet
if errorlevel 1 (
  "%GIT%" commit -m "Atualizacao de dados %date% %time:~0,5%"
  if errorlevel 1 (
    echo ERRO ao criar o commit. Nada foi enviado.
    pause & exit /b 1
  )
) else (
  echo Nenhuma alteracao nova nos dados. Verificando envios pendentes...
)
"%GIT%" fetch gitlab
if errorlevel 1 (
  echo ERRO: sem conexao com o GitLab corporativo. Verifique a rede.
  pause & exit /b 1
)
"%GIT%" merge gitlab/main -X ours --no-edit -m "Sincroniza com o GitLab"
if errorlevel 1 (
  "%GIT%" merge --abort
  echo ERRO ao sincronizar com o GitLab. Nada foi enviado.
  pause & exit /b 1
)
"%GIT%" push gitlab HEAD:refs/heads/main
if errorlevel 1 (
  echo ERRO no envio ao GitLab. Verifique a rede e o token.
  pause & exit /b 1
)
echo GitLab corporativo atualizado com sucesso.
echo.
echo Tentando copia opcional no GitHub...
"%GIT%" fetch origin >nul 2>&1
if errorlevel 1 (
  echo GitHub indisponivel nesta rede. Ignorado.
) else (
  "%GIT%" merge origin/main -X ours --no-edit -m "Sincroniza com o GitHub"
  "%GIT%" push origin HEAD:refs/heads/main
)
echo.
echo Pronto.
pause
