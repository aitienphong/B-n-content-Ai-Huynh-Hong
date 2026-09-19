type Payload = Record<string, any>;

const clean = (value: unknown, fallback = '') =>
  String(value ?? fallback).replace(/\s+/g, ' ').trim();

const time = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const topicFrom = (summary: string) => {
  const subject = clean(summary, 'một câu chuyện mới').slice(0, 110);
  return `Góc nhìn chưa từng kể: ${subject}`;
};

const backgroundFrom = (topic: string, visualStyle: string, style: string) =>
  `Bối cảnh được thiết kế theo phong cách ${clean(visualStyle, 'Cinematic')}, giữ nhịp điệu và cảm xúc từ phong cách gốc: ${clean(style, 'hình ảnh điện ảnh, ánh sáng có chiều sâu')}. Nội dung tập trung vào “${clean(topic)}”.`;

export function generateFreeContent(action: string, payload: Payload = {}) {
  if (action === 'verifyKey') return { success: true, mode: 'free-template' };

  if (action === 'generateInitialSetup') {
    const topic = topicFrom(payload.summary);
    return {
      topic,
      background: backgroundFrom(topic, payload.visualStyle, payload.style),
    };
  }

  if (action === 'generateTopic') {
    return { topic: topicFrom(payload.summary) };
  }

  if (action === 'generateBackground') {
    return {
      background: backgroundFrom(payload.topic, payload.visualStyle, payload.styleAnalysis),
    };
  }

  if (action === 'generateTimeline') {
    const duration = Math.max(8, Number(payload.durationSec) || 60);
    const count = Math.max(1, Math.ceil(duration / 8));
    const stages = [
      'HOOK GÂY TÒ MÒ',
      'ĐẶT VẤN ĐỀ',
      'MỞ NÚT THẮT',
      'CAO TRÀO',
      'GIẢI PHÁP',
      'BẰNG CHỨNG',
      'KẾT LUẬN & CTA',
    ];
    const lines = [
      `DÀN Ý CHI TIẾT: ${clean(payload.topic, 'CHỦ ĐỀ MỚI').toUpperCase()} (${duration} GIÂY)`,
      `Bối cảnh chung: ${clean(payload.background)}`,
      `Phong cách: ${clean(payload.styleAnalysis, 'Cinematic, giàu cảm xúc')}`,
      '',
    ];
    for (let i = 0; i < count; i++) {
      const start = i * 8;
      const end = Math.min(duration, start + 8);
      const stage = stages[Math.min(stages.length - 1, Math.floor((i / count) * stages.length))];
      lines.push(
        `PHẦN ${i + 1}: ${stage} (${time(start)} - ${time(end)})`,
        `1) Bối cảnh & Không gian: ${clean(payload.background)}`,
        `2) Hình ảnh & Góc máy: Cảnh ${i + 1}, bố cục rõ chủ thể, chuyển động điện ảnh phù hợp nhịp kể.`,
        `3) Âm thanh & Nhạc nền: Nhạc và hiệu ứng tăng dần theo cảm xúc của ${stage.toLowerCase()}.`,
        `4) Nội dung lời dẫn / Voice: Dẫn dắt tự nhiên, ngắn gọn, nối mạch sang cảnh tiếp theo.`,
        ''
      );
    }
    return { timeline: lines.join('\n') };
  }

  if (action === 'generatePrompts') {
    const count = Math.max(1, Math.min(75, Number(payload.N) || 8));
    const styles: Record<number, string> = {
      0: 'an immediate curiosity-driven opening',
      1: 'a clear problem-revealing moment',
      2: 'a discovery moment with visual evidence',
      3: 'an emotional turning point',
      4: 'a practical solution in action',
      5: 'a convincing proof moment',
      6: 'a memorable closing call to action',
    };
    const rows = Array.from({ length: count }, (_, index) => {
      const stage = Math.min(6, Math.floor((index / count) * 7));
      return {
        stt: index + 1,
        prompt: `Scene ${index + 1}, ${styles[stage]}, topic: ${clean(payload.timeline).slice(0, 180)}, setting: ${clean(payload.background)}, ${clean(payload.visualStyle, 'cinematic')} visual style, consistent main character, professional composition, expressive lighting, natural depth, high detail, aspect ratio ${clean(payload.aspectRatio, '16:9')}, no text, no watermark.`,
        voice: `Phân cảnh ${index + 1}: lời dẫn ${clean(payload.voiceLang, 'Tiếng Việt')} ngắn gọn, giàu cảm xúc, đúng mạch nội dung và kết thúc bằng một ý mở sang cảnh tiếp theo.`,
      };
    });
    return rows;
  }

  throw new Error('Hành động không hợp lệ.');
}
