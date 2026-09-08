export class GeminiService {
  private getUserCredentials() {
    const userSession = localStorage.getItem('app_user_session');
    let email = '';
    let phone = '';
    if (userSession) {
      try {
        const parsed = JSON.parse(userSession);
        email = parsed.email || '';
        phone = parsed.phone || '';
      } catch (e) {}
    }
    const customKey = localStorage.getItem('user_gemini_api_key') || '';
    return { email, phone, customKey };
  }

  private async callBackend(action: string, payload: any = {}) {
    const { email, phone, customKey } = this.getUserCredentials();

    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        phone,
        customKey,
        action,
        payload
      })
    });

    const data = await response.json();
    if (!response.ok) {
      if (data.error?.includes('Bạn cần mua gói') || response.status === 403) {
        throw new Error('SUBSCRIPTION_REQUIRED: ' + (data.error || 'Cần kích hoạt gói'));
      }
      if (data.error?.includes('429') || data.error?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('QUOTA_EXHAUSTED');
      }
      throw new Error(data.error || 'Lỗi xử lý AI từ máy chủ');
    }

    return data;
  }

  async verifyKey() {
    try {
      const res = await this.callBackend('verifyKey');
      return !!res.success;
    } catch (error: any) {
      if (error.message?.startsWith('SUBSCRIPTION_REQUIRED')) {
        // Handled specifically in UI
        return false;
      }
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message === 'QUOTA_EXHAUSTED') {
        throw new Error('QUOTA_EXHAUSTED');
      }
      return true;
    }
  }

  async generateInitialSetup(summary: string, style: string, mode: string, visualStyle: string): Promise<{topic: string, background: string}> {
    const res = await this.callBackend('generateInitialSetup', { summary, style, mode, visualStyle });
    return { topic: res.topic || '', background: res.background || '' };
  }

  async generateTopic(summary: string, style: string, mode: string): Promise<string> {
    const res = await this.callBackend('generateTopic', { summary, style, mode });
    return res.topic || '';
  }

  async generateBackground(topic: string, visualStyle: string, styleAnalysis: string): Promise<string> {
    const res = await this.callBackend('generateBackground', { topic, visualStyle, styleAnalysis });
    return res.background || '';
  }

  async generateTimeline(topic: string, background: string, durationSec: number, styleAnalysis: string): Promise<string> {
    const res = await this.callBackend('generateTimeline', { topic, background, durationSec, styleAnalysis });
    return res.timeline || '';
  }

  async generatePrompts(
    timeline: string, 
    background: string, 
    visualStyle: string, 
    aspectRatio: string, 
    N: number, 
    voiceLang: string,
    styleAnalysis: string = ''
  ): Promise<any[]> {
    const res = await this.callBackend('generatePrompts', {
      timeline,
      background,
      visualStyle,
      aspectRatio,
      N,
      voiceLang,
      styleAnalysis
    });
    return Array.isArray(res) ? res : [];
  }
}
