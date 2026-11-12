import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

async function test() {
  console.log("Probando Gemini API con Key:", process.env.GEMINI_API_KEY ? "Presente" : "Faltante");
  try {
    const result = await model.generateContent("Hola, responde solo con la palabra 'OK' si me escuchas.");
    console.log("Respuesta real de IA:", result.response.text());
  } catch (err: any) {
    console.error("Error en Gemini:", err.message);
  }
}

test();
