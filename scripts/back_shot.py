"""Compatibility entry point: back-mode checks now replay real device-motion events."""
import pathlib,runpy
runpy.run_path(str(pathlib.Path(__file__).with_name("back_motion_shot.py")),run_name="__main__")
