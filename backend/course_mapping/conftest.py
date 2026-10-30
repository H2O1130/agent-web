import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def pytest_configure(config: object) -> None:
    """在仓库根目录运行 `pytest backend` 时也能识别 live 标记。"""
    addini = getattr(config, "addinivalue_line", None)
    if callable(addini):
        addini("markers", "live: 需要 DEEPSEEK_API_KEY 的真实模型测试，默认跳过")