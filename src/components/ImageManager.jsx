import { useState } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

const TOGETHER_KEY = "tgp_v1_h2M7NTUWbFDKlx3nsVtBDV4j-GC87R9fNB1ff5pl39A";
const TOGETHER_URL = "https://api.together.xyz/v1/images/generations";
const SUPA_URL     = "https://eytoryygkxjslfvsqanl.supabase.co";

// ── Category colour fallbacks (shown when no image exists) ────────────────────
const CAT_COLORS = {
  "Botanical Extracts":    ["#E6F4EA","#2d6a4f"],
  "Herbal Powders":        ["#F0FDF4","#166534"],
  "Mushroom Extracts":     ["#FDF4FF","#6b21a8"],
  "Vitamins & Minerals":   ["#EFF6FF","#1d4ed8"],
  "Probiotics & Prebiotics":["#F0FDF4","#15803d"],
  "Proteins & Amino Acids":["#FFF7ED","#c2410c"],
  "Animal & Marine":       ["#EFF6FF","#0369a1"],
  "Enzymes":               ["#FEFCE8","#a16207"],
  "Greens & Superfoods":   ["#F0FDF4","#15803d"],
  "Fatty Acids & Oils":    ["#FFFBEB","#b45309"],
  "Cosmeceuticals":        ["#FDF4FF","#7e22ce"],
  "Sports Nutrition":      ["#FFF1F2","#be123c"],
  "Food Ingredients":      ["#FFF7ED","#ea580c"],
  "Chemical":              ["#F1F5F9","#475569"],
  "Premixes & Blends":     ["#EFF6FF","#2563eb"],
  "Pharmaceutical":        ["#F0F9FF","#0369a1"],
  "Dairy Ingredients":     ["#FFFBEB","#d97706"],
  "Feed":                  ["#F7FEE7","#4d7c0f"],
  "Pet Food":              ["#FFF7ED","#c2410c"],
};

// ── IMAGE PLACEHOLDER ─────────────────────────────────────────────────────────
export function ProductImagePlaceholder({ categoryName, productName, size = 120 }) {
  const [bg, text] = CAT_COLORS[categoryName] || ["#F1F5F9","#475569"];
  const initials = productName
    ? productName.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()
    : "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: bg, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4,
      border: `1px solid ${text}22`, flexShrink: 0
    }}>
      <span style={{ fontSize: size * 0.22, fontWeight: 700, color: text }}>{initials}</span>
      <span style={{ fontSize: size * 0.09, color: text, opacity: 0.7, textAlign: "center", padding: "0 6px", lineHeight: 1.2 }}>
        {categoryName?.split(" ")[0]}
      </span>
    </div>
  );
}

// ── MAIN IMAGE MANAGER ────────────────────────────────────────────────────────
function ImageManager({ productId, productName, categoryName, images, onImagesUpdated }) {
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState(null);
  const [progress, setProgress]     = useState("");

  const imageList = Array.isArray(images) ? images : [];
  const primaryImage = imageList[0] || null;

  // ── Generate image via Together AI ─────────────────────────────────────────
  async function generateImage() {
    setGenerating(true);
    setError(null);
    setProgress("Generating image with AI...");

    try {
      const prompt = `Professional product photography of ${productName}, a nutraceutical supplement ingredient, ${categoryName ? categoryName.toLowerCase() + " category, " : ""}pure powder or extract on white background, studio lighting, soft shadows, photorealistic, high detail, clean minimal background`;

      const res = await fetch(TOGETHER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOGETHER_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: 512,
          height: 512,
          steps: 4,
          n: 1,
          response_format: "b64_json"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Image generation failed");
      }

      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image returned");

      setProgress("Uploading to storage...");
      const url = await uploadBase64(b64, "image/png");
      await saveImageUrl(url);
      setProgress("");
    } catch(e) {
      setError(e.message);
      setProgress("");
    } finally {
      setGenerating(false);
    }
  }

  // ── Upload file from input ──────────────────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress("Uploading...");
    try {
      const arrayBuf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      const url = await uploadBase64(b64, file.type);
      await saveImageUrl(url);
      setProgress("");
    } catch(e) {
      setError(e.message);
      setProgress("");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // ── Upload base64 to Supabase Storage ──────────────────────────────────────
  async function uploadBase64(b64, mimeType) {
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `${productId}_${Date.now()}.${ext}`;

    // Decode base64 to blob
    const byteChars = atob(b64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: mimeType });

    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(filename, blob, { contentType: mimeType, upsert: true });

    if (error) throw new Error(error.message);

    const { data: { publicUrl } } = supabase.storage
      .from("product-images")
      .getPublicUrl(filename);

    return publicUrl;
  }

  // ── Save URL to products.images ─────────────────────────────────────────────
  async function saveImageUrl(url) {
    const updated = [url, ...imageList.filter(u => u !== url)];
    const { error } = await supabase
      .from("products")
      .update({ images: updated })
      .eq("id", productId);
    if (error) throw new Error(error.message);
    onImagesUpdated(updated);
  }

  // ── Remove an image ─────────────────────────────────────────────────────────
  async function removeImage(url) {
    if (!confirm("Remove this image?")) return;
    const updated = imageList.filter(u => u !== url);
    await supabase.from("products").update({ images: updated }).eq("id", productId);
    onImagesUpdated(updated);
  }

  const busy = generating || uploading;

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>
        Product Images
      </div>

      {/* Image grid */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {imageList.length === 0 && (
          <ProductImagePlaceholder categoryName={categoryName} productName={productName} size={80}/>
        )}
        {imageList.map((url, i) => (
          <div key={url} style={{ position: "relative" }}>
            <img
              src={url} alt={productName}
              style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: i === 0 ? `2px solid ${C.blue}` : `1px solid ${C.border}` }}
            />
            {i === 0 && (
              <span style={{ position: "absolute", bottom: 3, left: 3, background: C.blue, color: "white", fontSize: 8, borderRadius: 3, padding: "1px 4px" }}>Main</span>
            )}
            <button
              onClick={() => removeImage(url)}
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: C.red, color: "white", border: "none", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Progress / error */}
      {progress && (
        <div style={{ fontSize: 11, color: C.blue, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.blue, animation: "pulse 1s infinite" }}/>
          {progress}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>⚠ {error}</div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={generateImage}
          disabled={busy}
          style={{ background: busy ? C.muted : "#6366f1", color: "white", border: "none", borderRadius: 7, padding: "7px 14px", cursor: busy ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, opacity: busy ? 0.7 : 1 }}
        >
          {generating ? "Generating..." : "✨ Generate with AI"}
        </button>
        <label style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 11, fontWeight: 500, color: C.ink, display: "flex", alignItems: "center", gap: 5 }}>
          📎 Upload Image
          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} disabled={busy}/>
        </label>
        {imageList.length > 1 && (
          <span style={{ fontSize: 10, color: C.muted, alignSelf: "center" }}>{imageList.length} images · first is shown on website</span>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

export { ImageManager };
