import postgres from "npm:postgres@3.4.5";

type TelegramUpdate = {
  update_id?: number;
  message?: { chat?: { id?: number }; text?: string };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number }; message_id?: number };
  };
};

const connectionString = Deno.env.get("SUPABASE_DB_URL");
if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");

const sql = postgres(connectionString, {
  max: 2,
  prepare: false,
  connect_timeout: 8,
  idle_timeout: 20,
});

let cached: { token: string; webhookSecret: string; expires: number } | undefined;

async function loadSecrets(): Promise<{ token: string; webhookSecret: string }> {
  if (cached && Date.now() < cached.expires) return cached;
  const rows = await sql.unsafe(
    "SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name IN ('ld_latte_telegram_bot_token', 'ld_latte_telegram_webhook_secret')"
  );
  const values = new Map(rows.map((r) => [String(r.name), String(r.decrypted_secret)]));
  const token = values.get("ld_latte_telegram_bot_token");
  const webhookSecret = values.get("ld_latte_telegram_webhook_secret");
  if (!token || !webhookSecret) throw new Error("Telegram demo secrets are not configured in Vault");
  cached = { token, webhookSecret, expires: Date.now() + 60_000 };
  return cached;
}

function equalSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function telegramApi(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Telegram HTTP error: " + response.status);
  const answer = await response.json();
  if (!answer.ok) throw new Error("Telegram rejected the request");
}

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  buttons?: { text: string; callback_data: string }[][],
) {
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons && buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}


async function upsertInteractiveMessage(
  token: string,
  chatId: number,
  messageId: number | undefined,
  text: string,
  buttons?: { text: string; callback_data: string }[][],
) {
  if (!messageId) {
    await sendMessage(token, chatId, text, buttons);
    return;
  }
  // Edit the original Telegram message instead of adding another one to the chat.
  await telegramApi(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

async function showMenu(token: string, chatId: number, messageId?: number) {
  // The database is queried on every /start and every return to menu.
  const services = await sql.unsafe(
    "SELECT id,name FROM public.services WHERE active = true ORDER BY id",
  );
  const buttons = services.map((service) => [
    { text: String(service.name), callback_data: "service:" + service.id },
  ]);
  await upsertInteractiveMessage(
    token,
    chatId,
    messageId,
    services.length
      ? "🛍 Меню услуг\n\nВыберите услугу — бот подтвердит выбор.\nСписок обновляется из базы данных."
      : "Сейчас нет доступных услуг. Попробуйте позже.",
    buttons,
  );
  console.info("Menu rendered; active services:", services.length);
}

async function processUpdate(token: string, update: TelegramUpdate) {
  const message = update.message;
  const callback = update.callback_query;
  if (message?.chat?.id != null) {
    const command = (message.text || "").trim().split(/\s+/)[0].split("@")[0];
    if (command === "/start") {
      await showMenu(token, message.chat.id);
    } else if (command === "/help") {
      await sendMessage(token, message.chat.id, "Отправьте /start, чтобы увидеть актуальный список услуг.");
    }
    return;
  }
  if (callback?.id && callback.message?.chat?.id != null) {
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    // Acknowledge the tap promptly; otherwise Telegram keeps displaying a spinner.
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: callback.data === "menu" ? "Список обновлён" : "Выбор принят",
    });
    if (callback.data === "menu") {
      await showMenu(token, chatId, messageId);
      return;
    }
    const serviceId = /^service:(\d{1,18})$/.exec(callback.data || "")?.[1];
    const services = serviceId
      ? await sql.unsafe(
          "SELECT id,name FROM public.services WHERE id=$1 AND active=true LIMIT 1",
          [serviceId],
        )
      : [];
    const msg = services.length
      ? "✅ Вы выбрали услугу: " + services[0].name + "\n\nУслуга найдена по ID в базе данных. Можно вернуться к списку и выбрать другую."
      : "⚠️ Эта услуга больше недоступна. Меню могло измениться.";
    await upsertInteractiveMessage(token, chatId, messageId, msg, [
      [{ text: "↩️ Вернуться к списку услуг", callback_data: "menu" }],
    ]);
    console.info("Service callback processed; active choice:", services.length > 0);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return Response.json({ service: "LD LATTE Telegram demo", status: "online" });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const { token, webhookSecret } = await loadSecrets();
    const supplied = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!equalSecret(supplied, webhookSecret)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const length = Number(req.headers.get("content-length") || "0");
    if (length > 128000) return Response.json({ error: "Payload too large" }, { status: 413 });
    const update = await req.json() as TelegramUpdate;
    if (!update || typeof update !== "object") {
      return Response.json({ error: "Invalid Telegram update" }, { status: 400 });
    }
    await processUpdate(token, update);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\d{8,}:[A-Za-z0-9_-]+/g, "[REDACTED]") : "unknown error";
    console.error("Telegram demo update failed:", message);
    return Response.json({ error: "Temporary server error" }, { status: 503 });
  }
});
