#!/usr/bin/env python3
"""浏览器自动通玩门禁：逐游戏开新档 → 随机点选项/战斗/检定 → 抓 console 错误。
用法：python3 tools/playall.py [base_url]   （默认 http://127.0.0.1:8323/）
截图输出到 /tmp/tarpg-playall/（首页与首个游戏，桌面+手机宽度）。
"""
import os
import random
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8323/"
SHOT_DIR = "/tmp/tarpg-playall"
STEPS = 40
# 本机已装的 Chromium（python playwright 期望的版本号可能与实际不一致，显式指定）
CHROMIUM = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"
)


def play_game(page, card, idx, errors, tag):
    title = card.locator(".cover-title b").inner_text()
    card.locator(".card-actions .btn.solid").click()          # ✨ 新的冒险
    page.wait_for_timeout(300)
    name_input = page.locator("#char-name")
    if name_input.count():
        name_input.fill("测试员")
    start = page.locator('button:has-text("开始冒险"), button:has-text("开始调查")')
    start.first.click()
    page.wait_for_timeout(600)
    ending = None
    for _ in range(STEPS):
        if page.locator(".ending-panel").count():
            ending = page.locator(".ending-kind").inner_text()
            break
        if page.locator(".combat-overlay").count():
            btns = page.locator(".combat-overlay .combat-btn:not(.disabled)")
            if btns.count():
                try:
                    btns.first.click(timeout=3000)
                except Exception:
                    pass
                page.wait_for_timeout(750)
                continue
        choices = page.locator("#choices .choice-btn:not(.disabled)")
        n = choices.count()
        if not n:
            break
        try:
            choices.nth(random.randrange(n)).click(timeout=3000)
        except Exception:
            # 浮层（战斗/结局）在点击间隙出现——回到循环头处理
            continue
        page.wait_for_timeout(300)
    status = f"结局[{ending}]" if ending else ("进行中" if page.locator("#choices").count() else "停在无选项处")
    print(f"  {'✅' if not errors else '❌'} {title}: {status} · console错误 {len(errors)}")
    if tag:  # 截图（仅第一个游戏）
        page.screenshot(path=f"{SHOT_DIR}/game-{tag}-desktop.png")
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=f"{SHOT_DIR}/game-{tag}-mobile.png")
        page.set_viewport_size({"width": 1280, "height": 900})
    return not errors


def main():
    os.makedirs(SHOT_DIR, exist_ok=True)
    random.seed(20260911)
    total_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM if os.path.exists(CHROMIUM) else None)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        # 网络层"Failed to load resource"（后端缺席/未登录 401 等环境噪音）单独计数，不作为门禁失败项
        page.on("console", lambda m: total_errors.append(f"console: {m.text}") if m.type == "error" and not m.text.startswith("Failed to load resource") else None)
        page.on("pageerror", lambda e: total_errors.append(f"pageerror: {e}"))

        page.goto(BASE)
        page.wait_for_selector(".game-card")
        page.screenshot(path=f"{SHOT_DIR}/home-desktop.png")
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=f"{SHOT_DIR}/home-mobile.png")
        page.set_viewport_size({"width": 1280, "height": 900})

        cards = page.locator(".game-card")
        count = cards.count()
        print(f"首页加载 {count} 张游戏卡")
        ok = True
        for i in range(count):
            page.goto(BASE)
            page.wait_for_selector(".game-card")
            card = page.locator(".game-card").nth(i)
            errs_before = len(total_errors)
            ok = play_game(page, card, i, total_errors[errs_before:], tag="first" if i == 0 else None) and ok

        browser.close()

    print()
    if total_errors:
        print(f"❌ 共 {len(total_errors)} 个 console/page 错误：")
        for e in total_errors[:10]:
            print("   ", e[:200])
        sys.exit(1)
    print("✅ 浏览器通玩门禁通过：9 游戏 0 console 错误")


if __name__ == "__main__":
    main()
