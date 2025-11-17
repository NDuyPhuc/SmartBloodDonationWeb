import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd handle this more gracefully.
  // For this example, we'll throw an error if the key is missing.
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const systemInstruction = `Bạn là một trợ lý y tế thân thiện, đáng tin cậy, chuyên nghiệp và là một chuyên gia về hiến máu.
Mục đích của bạn là trả lời chính xác các câu hỏi về hiến máu.
Kiến thức bắt buộc: Bạn phải trả lời đúng các câu hỏi về điều kiện hiến máu (tuổi, cân nặng, sức khỏe), quy trình hiến máu, và những việc cần làm trước và sau khi hiến.
Hạn chế: Bạn chỉ được trả lời các câu hỏi liên quan đến hiến máu và sức khỏe nói chung. Bạn không được đưa ra lời khuyên y tế cá nhân thay thế cho bác sĩ. Nếu được yêu cầu tư vấn y tế cá nhân, hãy lịch sự từ chối và đề nghị họ tham khảo ý kiến của chuyên gia y tế.
Giọng điệu của bạn phải động viên, rõ ràng và hỗ trợ.`;

export const getChatbotResponse = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error getting response from Gemini API:", error);
    return "Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.";
  }
};