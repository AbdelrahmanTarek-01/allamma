export type CardDifficulty = 'easy' | 'medium' | 'hard';

/**
 * A card = two opposite poles. `right` is the first word of the pair as written ("رخيص ↔ غالي" -> right = رخيص),
 * which is where Arabic readers look first; `left` is the second. On the dial 0 degrees is the left pole.
 * Difficulty: easy = a clear scale everyone agrees on, hard = abstract or personal, so clues are harder to match.
 */
export interface WaveCard {
  right: string;
  left: string;
  difficulty: CardDifficulty;
}

const D = { e: 'easy', m: 'medium', h: 'hard' } as const;
const c = (right: string, left: string, d: keyof typeof D): WaveCard => ({ right, left, difficulty: D[d] });

export const CARDS: WaveCard[] = [
  // the starter list from 01-brainstorm/wave-game.md
  c('رخيص', 'غالي', 'e'),
  c('ممل', 'تحفة', 'e'),
  c('مصري جداً', 'مش مصري خالص', 'm'),
  c('بيتاكل في الشارع', 'بيتاكل في فرح', 'm'),
  c('الكبار بيحبوه', 'الشباب بيحبوه', 'm'),
  c('سهل', 'صعب', 'e'),
  c('قديم', 'جديد', 'e'),
  c('أكلة وحشة', 'أكلة تحفة', 'e'),
  c('فلوس كتير', 'مفلس خالص', 'e'),
  c('هادي', 'دوشة', 'e'),
  c('مفيد', 'ملوش لازمة', 'm'),
  c('مشهور', 'محدش يعرفه', 'm'),
  c('صيفي', 'شتوي', 'e'),
  c('مركّز', 'سرحان', 'm'),
  c('رومانسي', 'مش رومانسي', 'm'),
  c('مخيف', 'كيوت', 'e'),
  // more Egyptian pairs
  c('سريع', 'بطيء', 'e'),
  c('ساخن', 'بارد', 'e'),
  c('كبير', 'صغير', 'e'),
  c('طويل', 'قصير', 'e'),
  c('مهم', 'تافه', 'm'),
  c('شجاع', 'جبان', 'm'),
  c('نشيط', 'كسول', 'e'),
  c('بيضحّك', 'بيزعّل', 'm'),
  c('رسمي', 'كاجوال', 'm'),
  c('أكلة صحية', 'أكلة بتبوّظ الصحة', 'm'),
  c('أغنية قديمة', 'أغنية مهرجانات', 'm'),
  c('مدينة', 'ريف', 'e'),
  c('بيتعمل في البيت', 'بيتطلب دليفري', 'm'),
  c('مسلسل عبقري', 'مسلسل عبيط', 'm'),
  c('أصلي', 'تقليد', 'm'),
  c('يستاهل فلوسه', 'نصب', 'm'),
  c('عقلاني', 'عاطفي', 'h'),
  c('دمه خفيف', 'دمه تقيل', 'h'),
  c('لازم تحجزه', 'تدخل عليه على طول', 'h'),
  c('بيحصل كل يوم', 'بيحصل مرة في السنة', 'm'),
  c('موجود في كل بيت', 'نادر في البيوت', 'm'),
  c('لعبة لوحدك', 'لعبة جماعية', 'm'),
  c('شخص صباحي', 'شخص سهرانجي', 'm'),
  c('مخاطرة', 'آمن', 'h'),
  c('للعيال', 'للكبار بس', 'm'),
  c('بيتاكل بالإيد', 'محتاج معلقة وشوكة', 'h'),
  c('بيريّحني', 'بيتعبني', 'h'),
  c('جوّه البيت', 'بره البيت', 'e')
];
