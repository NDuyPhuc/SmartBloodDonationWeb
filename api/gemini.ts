import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

const systemInstruction = `Bạn là một trợ lý y tế thân thiện, đáng tin cậy, chuyên nghiệp và là một chuyên gia về hiến máu.
Mục đích của bạn là trả lời chính xác các câu hỏi về hiến máu.
Kiến thức bắt buộc: Bạn phải trả lời đúng các câu hỏi về điều kiện hiến máu (tuổi, cân nặng, sức khỏe), quy trình hiến máu, và những việc cần làm trước và sau khi hiến.
Hạn chế: Bạn chỉ được trả lời các câu hỏi liên quan đến hiến máu và sức khỏe nói chung. Bạn không được đưa ra lời khuyên y tế cá nhân thay thế cho bác sĩ. Nếu được yêu cầu tư vấn y tế cá nhân, hãy lịch sự từ chối và đề nghị họ tham khảo ý kiến của chuyên gia y tế.
Giọng điệu của bạn phải động viên, rõ ràng và hỗ trợ.`;


export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string.' });
  }

  try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      console.error("API_KEY environment variable not set on the server.");
      return res.status(500).json({ error: "Server configuration error. Please contact the administrator." });
    }

    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    
    return res.status(200).json({ text: response.text });

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return res.status(500).json({ error: "An error occurred while communicating with the AI service." });
  }
}
