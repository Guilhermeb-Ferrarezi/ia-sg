import type { Express, RequestHandler } from "express";

type LogEventFn = (
  level: "info" | "warn" | "error",
  event: string,
  data?: Record<string, unknown>
) => void;

type SettingsRouteDeps = {
  requireSession: RequestHandler;
  getAISettings: () => Promise<Record<string, unknown>>;
  updateAISettings: (payload: unknown) => Promise<Record<string, unknown>>;
  logEvent: LogEventFn;
  formatError: (err: unknown) => string;
  whatsappPhoneNumberId: string;
  whatsappToken: string;
};

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps): void {
  app.get("/api/settings/ai", deps.requireSession, async (_req, res) => {
    res.json(await deps.getAISettings());
  });

  app.put("/api/settings/ai", deps.requireSession, async (req, res) => {
    const payload = await deps.updateAISettings(req.body);

    deps.logEvent("info", "settings.ai.updated", {
      updatedFields: Object.keys(req.body || {}),
      persistedInDb: true
    });

    res.json(payload);
  });

  app.get("/api/settings/whatsapp-profile", deps.requireSession, async (_req, res) => {
    try {
      const profileResp = await fetch(
        `https://graph.facebook.com/v20.0/${deps.whatsappPhoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
        { headers: { Authorization: `Bearer ${deps.whatsappToken}` } }
      );

      if (!profileResp.ok) {
        const text = await profileResp.text().catch(() => "");
        deps.logEvent("error", "whatsapp.profile.fetch_failed", { status: profileResp.status, response: text });
        res.status(profileResp.status).json({ message: `Meta API erro: ${profileResp.status}`, detail: text });
        return;
      }

      const profileData = await profileResp.json();
      const profile = profileData?.data?.[0] || {};

      const phoneResp = await fetch(
        `https://graph.facebook.com/v20.0/${deps.whatsappPhoneNumberId}?fields=verified_name,display_phone_number,quality_rating,name_status`,
        { headers: { Authorization: `Bearer ${deps.whatsappToken}` } }
      );

      let phoneData: Record<string, unknown> = {};
      if (phoneResp.ok) {
        phoneData = await phoneResp.json();
      }

      res.json({
        phoneNumberId: deps.whatsappPhoneNumberId,
        verifiedName: phoneData.verified_name || null,
        displayPhoneNumber: phoneData.display_phone_number || null,
        qualityRating: phoneData.quality_rating || null,
        nameStatus: phoneData.name_status || null,
        about: profile.about || null,
        address: profile.address || null,
        description: profile.description || null,
        email: profile.email || null,
        profilePictureUrl: profile.profile_picture_url || null,
        websites: profile.websites || [],
        vertical: profile.vertical || null
      });
    } catch (err) {
      deps.logEvent("error", "whatsapp.profile.error", { error: deps.formatError(err) });
      res.status(500).json({ message: "Falha ao buscar perfil do WhatsApp.", error: deps.formatError(err) });
    }
  });

  app.put("/api/settings/whatsapp-profile", deps.requireSession, async (req, res) => {
    try {
      const { about, address, description, email, websites, vertical } = req.body || {};
      const payload: Record<string, unknown> = { messaging_product: "whatsapp" };

      if (typeof about === "string") payload.about = about.slice(0, 139);
      if (typeof address === "string") payload.address = address.slice(0, 256);
      if (typeof description === "string") payload.description = description.slice(0, 512);
      if (typeof email === "string") payload.email = email.slice(0, 128);
      if (Array.isArray(websites)) payload.websites = websites.slice(0, 2).map((item: unknown) => typeof item === "string" ? item.slice(0, 256) : "");
      if (typeof vertical === "string") payload.vertical = vertical;

      const resp = await fetch(
        `https://graph.facebook.com/v20.0/${deps.whatsappPhoneNumberId}/whatsapp_business_profile`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.whatsappToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        deps.logEvent("error", "whatsapp.profile.update_failed", { status: resp.status, response: text, payload });
        res.status(resp.status).json({ message: `Meta API erro: ${resp.status}`, detail: text });
        return;
      }

      deps.logEvent("info", "whatsapp.profile.updated", { updatedFields: Object.keys(req.body || {}) });
      res.json({ success: true, message: "Perfil atualizado com sucesso." });
    } catch (err) {
      deps.logEvent("error", "whatsapp.profile.update_error", { error: deps.formatError(err) });
      res.status(500).json({ message: "Falha ao atualizar perfil.", error: deps.formatError(err) });
    }
  });

  app.post("/api/settings/whatsapp-profile/photo", deps.requireSession, async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      if (imageBuffer.length === 0) {
        res.status(400).json({ message: "Nenhuma imagem enviada." });
        return;
      }

      if (imageBuffer.length > 5 * 1024 * 1024) {
        res.status(400).json({ message: "Imagem muito grande. Maximo 5MB." });
        return;
      }

      const contentType = req.headers["content-type"] || "image/jpeg";

      const createSessionResp = await fetch(
        `https://graph.facebook.com/v20.0/${deps.whatsappPhoneNumberId}/media`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.whatsappToken}`,
            "Content-Type": contentType,
            "Content-Length": String(imageBuffer.length)
          },
          body: imageBuffer
        }
      );

      if (!createSessionResp.ok) {
        const text = await createSessionResp.text().catch(() => "");
        deps.logEvent("error", "whatsapp.profile.photo_upload_failed", { status: createSessionResp.status, response: text });
        res.status(createSessionResp.status).json({ message: `Falha no upload: ${createSessionResp.status}`, detail: text });
        return;
      }

      const mediaData = await createSessionResp.json();
      const mediaId = mediaData?.id;

      if (!mediaId) {
        res.status(500).json({ message: "Media ID nao retornado pela Meta." });
        return;
      }

      const updateResp = await fetch(
        `https://graph.facebook.com/v20.0/${deps.whatsappPhoneNumberId}/whatsapp_business_profile`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.whatsappToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            profile_picture_handle: mediaId
          })
        }
      );

      if (!updateResp.ok) {
        const text = await updateResp.text().catch(() => "");
        deps.logEvent("error", "whatsapp.profile.photo_set_failed", { status: updateResp.status, response: text });
        res.status(updateResp.status).json({ message: `Falha ao definir foto: ${updateResp.status}`, detail: text });
        return;
      }

      deps.logEvent("info", "whatsapp.profile.photo_updated", { mediaId, size: imageBuffer.length });
      res.json({ success: true, message: "Foto de perfil atualizada.", mediaId });
    } catch (err) {
      deps.logEvent("error", "whatsapp.profile.photo_error", { error: deps.formatError(err) });
      res.status(500).json({ message: "Falha ao atualizar foto.", error: deps.formatError(err) });
    }
  });
}
