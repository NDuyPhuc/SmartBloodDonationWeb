
export const getChatbotResponse = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error from API proxy:", errorData.error);
      throw new Error(errorData.error || 'API request failed');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Error getting response from API proxy:", error);
    return "Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.";
  }
};