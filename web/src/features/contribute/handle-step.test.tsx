import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

// The real route tree, opened on the Profile & Handle step.
async function openHandleStep() {
  const router = createMemoryRouter(routes, {
    initialEntries: ["/contribute/profile"],
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect.element(heading(screen)).toBeVisible();
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openHandleStep>>["screen"];

// A publisher whose provider account suggested nothing, as the handle save answers too.
const withoutSuggestion: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "google",
  handle: null,
  accountExists: false,
};

const publisher: SessionUser = {
  ...withoutSuggestion,
  suggestedHandle: "ddieruf",
};

// The session endpoint answers for a signed-in publisher with no account yet.
function signIn(user: Partial<SessionUser> = {}) {
  const signedIn: SessionUser = { ...publisher, ...user };
  worker.use(
    http.get("/api/session", () => HttpResponse.json({ user: signedIn })),
  );
  return signedIn;
}

// A publisher whose provider account suggested nothing.
function signInWithoutSuggestion() {
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({ user: withoutSuggestion }),
    ),
  );
}

type Availability = "available" | "taken" | "invalid";

// The availability check answers from a table of handles; any other handle is available.
// Returns the handles it was asked about, in order.
function answerAvailability(answers: Record<string, Availability> = {}) {
  const asked: string[] = [];
  worker.use(
    http.get("/api/handles/availability", ({ request }) => {
      const handle = new URL(request.url).searchParams.get("handle") ?? "";
      asked.push(handle);
      const availability = answers[handle] ?? "available";
      return HttpResponse.json({ handle, availability, message: "" });
    }),
  );
  return asked;
}

function problem(status: number, detail: string, message: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: status === 409 ? "Conflict" : "Bad Request",
      status,
      detail,
      errors: [{ field: "handle", message }],
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Choose your handle" });
}

function field(screen: Screen) {
  return screen.getByLabelText("Handle", { exact: true });
}

function continueButton(screen: Screen) {
  return screen.getByRole("button", { name: "Continue" });
}

// The availability line: the first status region, under the field. The footer's hint is the
// second.
function statusLine(screen: Screen) {
  return screen.getByRole("status").first();
}

function availabilityLine(screen: Screen) {
  const line = statusLine(screen).element();
  const describedBy = field(screen).element().getAttribute("aria-describedby");
  expect(describedBy?.split(" ")).toContain(line.id);
  return line;
}

function previewAddress(screen: Screen) {
  return screen.getByText(/^durables\.dev\/.+\/my-activity@1\.0\.0$/);
}

// The colour a token resolves to here, in the form getComputedStyle reports it.
function tokenColour(token: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

const formatMessage =
  "Use 3 to 39 lowercase letters, numbers and single hyphens.";

afterEach(() => {
  sessionStorage.clear();
});

describe("the step as it opens", () => {
  test("shows the heading, the bold permanence sentence and the format help", async () => {
    signIn();
    answerAvailability();
    const { screen } = await openHandleStep();

    await expect.element(heading(screen)).toHaveFocus();
    const statement = screen.getByText(
      /^Your handle is the first part of every address you publish\./,
    );
    await expect
      .element(statement)
      .toHaveTextContent(
        "Your handle is the first part of every address you publish. It can't be changed later, because published addresses never change.",
      );
    const bold = statement.getByText("It can't be changed later", {
      exact: true,
    });
    expect(bold.element().tagName).toBe("STRONG");
    expect(
      Number(getComputedStyle(bold.element()).fontWeight),
    ).toBeGreaterThanOrEqual(600);
    await expect
      .element(
        screen.getByText(
          /^3 to 39 characters: lowercase letters, numbers and single hyphens\./,
        ),
      )
      .toBeVisible();
  });

  test("the field sits under the label Handle, behind a fixed durables.dev/ prefix", async () => {
    signIn();
    answerAvailability();
    const { screen } = await openHandleStep();

    const input = field(screen).element();
    expect(input.tagName).toBe("INPUT");
    const prefix = screen.getByText("durables.dev/", { exact: true });
    await expect.element(prefix).toBeVisible();
    expect(prefix.element().parentElement?.contains(input)).toBe(true);
    expect(prefix.element().getBoundingClientRect().right).toBeLessThanOrEqual(
      input.getBoundingClientRect().left,
    );
  });

  test("a suggestion fills the field and the help text names the provider", async () => {
    signIn({ provider: "google", suggestedHandle: "ddieruf" });
    const asked = answerAvailability();
    const { screen } = await openHandleStep();

    await expect.element(field(screen)).toHaveValue("ddieruf");
    await expect
      .element(
        screen.getByText(
          "3 to 39 characters: lowercase letters, numbers and single hyphens. Suggested from your Google account.",
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf is available.");
    expect(asked).toEqual(["ddieruf"]);
  });

  test("the help text names whichever provider was used", async () => {
    signIn({ provider: "gitlab", suggestedHandle: "dana" });
    answerAvailability();
    const { screen } = await openHandleStep();

    await expect.element(field(screen)).toHaveValue("dana");
    await expect
      .element(screen.getByText(/Suggested from your GitLab account\.$/))
      .toBeVisible();
  });

  test("with no suggestion the field is empty, asks for a handle and the preview shows your-handle", async () => {
    signInWithoutSuggestion();
    const asked = answerAvailability();
    const { screen } = await openHandleStep();

    await expect.element(field(screen)).toHaveValue("");
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("Choose a handle.");
    await expect
      .element(previewAddress(screen))
      .toHaveTextContent("durables.dev/your-handle/my-activity@1.0.0");
    await expect.element(continueButton(screen)).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/Suggested from/);
    expect(asked).toEqual([]);
  });
});

describe("typing a handle", () => {
  test("an uppercase letter is lowercased as it is typed", async () => {
    signInWithoutSuggestion();
    answerAvailability();
    const { screen } = await openHandleStep();

    await userEvent.type(field(screen), "DDieruf");
    await expect.element(field(screen)).toHaveValue("ddieruf");

    await field(screen).fill("Dana-Dev");
    await expect.element(field(screen)).toHaveValue("dana-dev");
  });

  test("lowercasing keeps the caret where it was typed", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    const { screen } = await openHandleStep();

    const input = field(screen).element() as HTMLInputElement;
    await userEvent.click(field(screen));
    input.setSelectionRange(1, 1);
    await userEvent.keyboard("X");

    await expect.element(field(screen)).toHaveValue("dxdieruf");
    expect(input.selectionStart).toBe(2);
  });

  test("a valid, free handle shows the teal available line and enables Continue", async () => {
    signInWithoutSuggestion();
    answerAvailability({ "dana-dev": "available" });
    const { screen } = await openHandleStep();

    await field(screen).fill("dana-dev");

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("dana-dev is available.");
    expect(getComputedStyle(availabilityLine(screen)).color).toBe(
      tokenColour("--positive"),
    );
    expect(getComputedStyle(availabilityLine(screen)).color).not.toBe(
      tokenColour("--fg"),
    );
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("a used or retired handle shows is taken and disables Continue", async () => {
    signInWithoutSuggestion();
    answerAvailability({ ddieruf: "taken" });
    const { screen } = await openHandleStep();

    await field(screen).fill("ddieruf");

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf is taken.");
    expect(getComputedStyle(availabilityLine(screen)).color).toBe(
      tokenColour("--fg"),
    );
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("a reserved word shows is taken and disables Continue", async () => {
    signInWithoutSuggestion();
    answerAvailability();
    const { screen } = await openHandleStep();

    for (const word of ["admin", "temporal", "contribute"]) {
      await field(screen).fill(word);
      await expect
        .element(statusLine(screen))
        .toHaveTextContent(`${word} is taken.`);
      await expect.element(continueButton(screen)).toBeDisabled();
    }
  });

  test("a bad format shows the format message and disables Continue", async () => {
    signInWithoutSuggestion();
    const asked = answerAvailability();
    const { screen } = await openHandleStep();

    for (const handle of ["dd", "-dana", "dana-", "da--na", "dana_dev"]) {
      await field(screen).fill(handle);
      await expect.element(statusLine(screen)).toHaveTextContent(formatMessage);
      await expect.element(continueButton(screen)).toBeDisabled();
    }
    expect(asked).toEqual([]);
  });

  test("clearing the field asks for a handle and the preview shows your-handle", async () => {
    signIn();
    answerAvailability();
    const { screen } = await openHandleStep();

    await field(screen).fill("");

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("Choose a handle.");
    await expect
      .element(previewAddress(screen))
      .toHaveTextContent("durables.dev/your-handle/my-activity@1.0.0");
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("reads Checking… while the handle is looked up, with Continue disabled", async () => {
    signInWithoutSuggestion();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    worker.use(
      http.get("/api/handles/availability", async () => {
        await answered;
        return HttpResponse.json({
          handle: "dana-dev",
          availability: "available",
          message: "",
        });
      }),
    );
    const { screen } = await openHandleStep();

    await field(screen).fill("dana-dev");

    await expect.element(statusLine(screen)).toHaveTextContent("Checking…");
    await expect.element(continueButton(screen)).toBeDisabled();
    answer();
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("dana-dev is available.");
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("only the answer for the latest handle is shown", async () => {
    signInWithoutSuggestion();
    let answerSlow: () => void = () => undefined;
    const slowAnswered = new Promise<void>((resolve) => {
      answerSlow = resolve;
    });
    let slowDone = false;
    worker.use(
      http.get("/api/handles/availability", async ({ request }) => {
        const handle = new URL(request.url).searchParams.get("handle") ?? "";
        if (handle === "dana") {
          // The earlier handle's answer arrives last, and says available.
          await slowAnswered;
          slowDone = true;
          return HttpResponse.json({
            handle,
            availability: "available",
            message: "",
          });
        }
        return HttpResponse.json({
          handle,
          availability: "taken",
          message: "",
        });
      }),
    );
    const { screen } = await openHandleStep();

    await field(screen).fill("dana");
    await expect.element(statusLine(screen)).toHaveTextContent("Checking…");
    await field(screen).fill("danad");
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("danad is taken.");

    answerSlow();
    await expect.poll(() => slowDone).toBe(true);
    await delay(100);

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("danad is taken.");
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("the preview shows the handle in the field, in the link colour", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    const { screen } = await openHandleStep();

    const preview = screen.getByText("Your first address will look like", {
      exact: true,
    });
    await expect.element(preview).toBeVisible();
    await expect
      .element(previewAddress(screen))
      .toHaveTextContent("durables.dev/ddieruf/my-activity@1.0.0");

    await field(screen).fill("dana-dev");
    await expect
      .element(previewAddress(screen))
      .toHaveTextContent("durables.dev/dana-dev/my-activity@1.0.0");
    const handlePart = previewAddress(screen).getByText("dana-dev", {
      exact: true,
    });
    expect(getComputedStyle(handlePart.element()).color).toBe(
      tokenColour("--link"),
    );
  });
});

describe("the availability check fails", () => {
  test("shows a retry message, keeps Continue disabled, and Try again checks again", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    let failing = true;
    worker.use(
      http.get("/api/handles/availability", () =>
        failing
          ? HttpResponse.json(
              {
                type: "about:blank",
                title: "Internal Server Error",
                status: 500,
              },
              { status: 500 },
            )
          : HttpResponse.json({
              handle: "ddieruf",
              availability: "available",
              message: "",
            }),
      ),
    );
    const { screen } = await openHandleStep();

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("We couldn't check ddieruf. Try again.");
    await expect.element(continueButton(screen)).toBeDisabled();

    failing = false;
    await screen.getByRole("button", { name: "Try again" }).click();

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf is available.");
    await expect.element(continueButton(screen)).toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: "Try again" }))
      .not.toBeInTheDocument();
  });
});

describe("Continue", () => {
  test("saves the handle and opens the Code step", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    const saved: unknown[] = [];
    worker.use(
      http.put("/api/session/handle", async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({
          user: { ...withoutSuggestion, handle: "dana-dev" },
        });
      }),
    );
    const { screen, router } = await openHandleStep();

    await field(screen).fill("Dana-Dev");
    await expect.element(continueButton(screen)).toBeEnabled();
    await continueButton(screen).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/code");
    expect(saved).toEqual([{ handle: "dana-dev" }]);
    const steps = screen.getByRole("navigation", { name: "Steps" });
    await expect
      .element(steps.getByRole("link", { name: "Code" }))
      .toHaveAttribute("aria-current", "step");
    await expect
      .element(steps.getByRole("link", { name: "Profile & Handle (finished)" }))
      .toBeVisible();
  });

  test("a save that answers 409 shows is taken and stays on the step", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    worker.use(
      http.put("/api/session/handle", () =>
        problem(409, "ddieruf is taken.", "ddieruf is taken."),
      ),
    );
    const { screen, router } = await openHandleStep();

    await expect.element(continueButton(screen)).toBeEnabled();
    await continueButton(screen).click();

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf is taken.");
    await expect.element(continueButton(screen)).toBeDisabled();
    await expect.element(heading(screen)).toBeVisible();
    await expect.element(field(screen)).toHaveValue("ddieruf");
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("a save that answers 400 shows the format message and stays on the step", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    worker.use(
      http.put("/api/session/handle", () =>
        problem(400, "The request is not valid.", formatMessage),
      ),
    );
    const { screen, router } = await openHandleStep();

    await expect.element(continueButton(screen)).toBeEnabled();
    await continueButton(screen).click();

    await expect.element(statusLine(screen)).toHaveTextContent(formatMessage);
    await expect.element(continueButton(screen)).toBeDisabled();
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("a refused handle is checked again once the publisher changes it", async () => {
    signIn({ suggestedHandle: "ddieruf" });
    answerAvailability();
    worker.use(
      http.put("/api/session/handle", () =>
        problem(409, "ddieruf is taken.", "ddieruf is taken."),
      ),
    );
    const { screen } = await openHandleStep();

    await continueButton(screen).click();
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf is taken.");
    await field(screen).fill("ddieruf2");

    await expect
      .element(statusLine(screen))
      .toHaveTextContent("ddieruf2 is available.");
    await expect.element(continueButton(screen)).toBeEnabled();
  });
});

describe("Back", () => {
  test("returns to the sign-in step and the publisher stays signed in", async () => {
    signIn();
    answerAvailability();
    const { screen, router } = await openHandleStep();

    await screen.getByRole("button", { name: "Back" }).click();

    await expect
      .element(
        screen.getByRole("heading", {
          level: 2,
          name: "Sign in to contribute",
        }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
    expect(router.state.location.search).toBe("?sign-in=again");
    await expect
      .element(
        screen
          .getByRole("banner")
          .getByRole("button", { name: "Account menu" }),
      )
      .toHaveTextContent("DD");
  });
});

describe("coming back before publishing", () => {
  test("the chosen handle is filled in and checked again on arrival", async () => {
    signIn({ suggestedHandle: "ddieruf", handle: "dana-dev" });
    const asked = answerAvailability({ "dana-dev": "taken" });
    const router = createMemoryRouter(routes, {
      initialEntries: ["/contribute"],
    });
    const screen = await render(<RouterProvider router={router} />, {
      wrapper: TestProviders,
    });

    await expect.element(heading(screen)).toBeVisible();
    await expect.element(field(screen)).toHaveValue("dana-dev");
    await expect
      .element(statusLine(screen))
      .toHaveTextContent("dana-dev is taken.");
    await expect.element(continueButton(screen)).toBeDisabled();
    expect(asked).toEqual(["dana-dev"]);
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });
});
