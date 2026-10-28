@echo off
chcp 65001 >nul
echo [1/3] 가상 환경 생성 중...
python -m venv venv

echo [2/3] 필요한 라이브러리 설치 중...
call venv\Scripts\activate
pip install -r requirements.txt

echo [3/3] 백엔드 서버 구동 중...
set PYTHONPATH=%CD%
python server/main.py
pause