from PyInstaller.utils.hooks import collect_data_files, collect_submodules


browser_use_data = collect_data_files("browser_use")
keyring_backends = collect_submodules("keyring.backends")

hidden_imports = [
    "browser_use.agent.service",
    "browser_use.browser",
    "browser_use.llm.browser_use.chat",
    "browser_use.llm.openai.chat",
    *keyring_backends,
]

a = Analysis(
    ["app.py"],
    pathex=["."],
    binaries=[],
    datas=[("qml/Main.qml", "qml"), *browser_use_data],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PySide6.QtCharts",
        "PySide6.QtMultimedia",
        "PySide6.QtPdf",
        "PySide6.QtQuick3D",
        "PySide6.QtTest",
        "PySide6.QtWebEngineCore",
        "PySide6.QtWebEngineQuick",
        "PySide6.QtWebEngineWidgets",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="QA Orbit Agent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    argv_emulation=False,
    target_arch="arm64",
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="QA Orbit Agent",
)

app = BUNDLE(
    coll,
    name="QA Orbit Agent.app",
    icon=None,
    bundle_identifier="com.qaorbit.local-agent",
    version="0.2.0",
    info_plist={
        "CFBundleDisplayName": "QA Orbit Agent",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "11.0",
    },
)
