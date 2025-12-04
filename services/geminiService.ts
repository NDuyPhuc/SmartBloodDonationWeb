
import { GoogleGenAI, Chat } from "@google/genai";

const SYSTEM_INSTRUCTION = `Bạn là một trợ lý y tế thân thiện, đáng tin cậy, chuyên nghiệp và là một chuyên gia về hiến máu.
Mục đích của bạn là trả lời chính xác các câu hỏi về hiến máu.
Kiến thức bắt buộc: Bạn phải trả lời đúng các câu hỏi về điều kiện hiến máu (tuổi, cân nặng, sức khỏe), quy trình hiến máu, và những việc cần làm trước và sau khi hiến.
Hạn chế: Bạn chỉ được trả lời các câu hỏi liên quan đến hiến máu và sức khỏe nói chung. Bạn không được đưa ra lời khuyên y tế cá nhân thay thế cho bác sĩ. Nếu được yêu cầu tư vấn y tế cá nhân, hãy lịch sự từ chối và đề nghị họ tham khảo ý kiến của chuyên gia y tế.
Giọng điệu của bạn phải động viên, rõ ràng và hỗ trợ.`;

let chatSession: Chat | null = null;

export const resetChatSession = () => {
    chatSession = null;
};

export const getChatbotResponse = async (prompt: string): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API Key not found");
        return "Lỗi: Hệ thống chưa được cấu hình API Key.";
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    if (!chatSession) {
        chatSession = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
            },
        });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text;
  } catch (error) {
    console.error("Error getting response from Gemini:", error);
    // Reset session in case of critical error to prevent stuck state
    chatSession = null; 
    return "Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng kiểm tra lại mạng hoặc thử lại sau.";
  }
};
