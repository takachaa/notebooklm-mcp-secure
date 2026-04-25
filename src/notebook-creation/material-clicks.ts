/**
 * Helpers for clicking Material/Angular elements via Playwright's trusted
 * pointer events.
 *
 * Programmatic JS .click() (i.e. `el.click()` inside `page.evaluate`) does
 * NOT fire Material's @HostListener('click') handlers reliably — Angular
 * inspects `event.isTrusted` on certain interactions and ignores untrusted
 * events. Symptoms include radio selections that visually appear chosen but
 * never update the underlying form control, toggle buttons that revert
 * immediately, and dismiss/generate buttons that no-op (or, on some pages,
 * surface unrelated overlays such as the Google emoji-keyboard).
 *
 * The pattern below uses `evaluateHandle` to locate the element via
 * arbitrary JS (which can match anything — text, value, attribute combos),
 * then dispatches a real CDP-driven click on the resulting handle. The
 * resulting click event has `isTrusted: true`.
 */

import type { Page } from "patchright";

/**
 * Locate an element with custom JS, then click it using Playwright's
 * trusted-event click. Returns true if click dispatched successfully.
 *
 * The `find` callback runs in browser context — it must return a single
 * Element (or null). Closure variables aren't available; pass primitives
 * via the `arg` parameter.
 */
export async function clickFoundByJs(
  page: Page,
  find: (arg: any) => any,
  arg?: any,
  opts: { force?: boolean; timeout?: number } = {}
): Promise<{ clicked: boolean; reason?: string }> {
  const handle = await page.evaluateHandle(find as any, arg);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return { clicked: false, reason: "element not found" };
  }
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await el.click({ timeout: opts.timeout ?? 5000, force: opts.force });
    return { clicked: true };
  } catch (e: any) {
    return { clicked: false, reason: e?.message?.split("\n")[0] ?? String(e) };
  } finally {
    await handle.dispose();
  }
}

/** Click the wrapper mat-radio-button whose underlying input has the given value. */
export async function clickMatRadioByValue(
  page: Page,
  scopeSelector: string,
  value: string
): Promise<{ clicked: boolean; reason?: string }> {
  return clickFoundByJs(
    page,
    (args: { scope: string; value: string }) => {
      // @ts-expect-error - DOM types
      const radios = document.querySelectorAll(`${args.scope} mat-radio-button`);
      for (const r of radios) {
        const input = (r as any).querySelector('input[type="radio"]');
        if (input && (input as any).value === args.value) return r;
      }
      return null;
    },
    { scope: scopeSelector, value },
    { force: true }
  );
}

/** Click a mat-button-toggle whose textContent contains any of the given labels (case-insensitive). */
export async function clickMatToggleByLabel(
  page: Page,
  scopeSelector: string,
  labels: string[]
): Promise<{ clicked: boolean; reason?: string }> {
  return clickFoundByJs(
    page,
    (args: { scope: string; labels: string[] }) => {
      // @ts-expect-error - DOM types
      const toggles = document.querySelectorAll(`${args.scope} mat-button-toggle`);
      for (const t of toggles) {
        const txt = ((t as any).textContent || "").trim().toLowerCase();
        if (args.labels.some((l) => txt.includes(l.toLowerCase()))) return t;
      }
      return null;
    },
    { scope: scopeSelector, labels },
    { force: true }
  );
}

/** Click the dialog's primary submit (生成 / Generate / 挿入 / Create) button. */
export async function clickDialogSubmitButton(
  page: Page
): Promise<{ clicked: boolean; reason?: string; buttonText?: string }> {
  const handle = await page.evaluateHandle(() => {
    // @ts-expect-error - DOM types
    const buttons = document.querySelectorAll("mat-dialog-container button");
    let primary: any = null;
    for (const b of buttons) {
      if ((b as any).disabled) continue;
      const text = ((b as any).textContent || "").trim();
      const cls = ((b as any).className || "").toString();
      if (/close|cancel|キャンセル|閉じる/i.test(text)) continue;
      if (/^(生成|create|generate|挿入)$/i.test(text)) return b;
      if ((cls.includes("mdc-button--unelevated") || cls.includes("button-color--primary")) && !primary) {
        primary = b;
      }
    }
    return primary;
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return { clicked: false, reason: "no eligible submit button found in dialog" };
  }
  const buttonText = await el.evaluate((node: any) => ((node.textContent || "") as string).trim());
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await el.click({ timeout: 5000 });
    return { clicked: true, buttonText };
  } catch (e: any) {
    return { clicked: false, buttonText, reason: e?.message?.split("\n")[0] ?? String(e) };
  } finally {
    await handle.dispose();
  }
}

/** Open a mat-select trigger and pick an option whose text matches `target`. */
export async function pickMatSelectOption(
  page: Page,
  scopeSelector: string,
  target: string
): Promise<{ clicked: boolean; reason?: string }> {
  const opened = await clickFoundByJs(
    page,
    (scope: string) => {
      // @ts-expect-error - DOM types
      return document.querySelector(`${scope} mat-select`);
    },
    scopeSelector,
    { force: true }
  );
  if (!opened.clicked) return opened;
  try {
    await page.waitForSelector('.cdk-overlay-pane mat-option, .cdk-overlay-pane [role="option"]', { timeout: 5000 });
  } catch {
    return { clicked: false, reason: "options pane never appeared" };
  }
  return clickFoundByJs(
    page,
    (t: string) => {
      // @ts-expect-error - DOM types
      const opts = document.querySelectorAll('.cdk-overlay-pane mat-option, .cdk-overlay-pane [role="option"]');
      for (const o of opts) {
        const txt = ((o as any).textContent || "").trim();
        if (txt === t || txt.includes(t)) return o;
      }
      return null;
    },
    target
  );
}
