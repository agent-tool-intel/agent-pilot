import { z } from 'zod';
import { getDb } from './db.js';
import { toMCPResponse } from './types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Classification Schema ───
const ModelClassifyInput = z.object({
  task_description: z.string().min(1).describe('Task description to classify'),
});

// ─── Route Schema ───
const ModelRouteInput = z.object({
  task_description: z.string().min(1),
  available_models: z.array(z.string()).optional().describe('User available models. If empty, uses all from active plan.'),
  plan_preset: z.enum(['A', 'B', 'C']).optional().default('B').describe('Plan preset: A=International, B=China, C=GLM Lazy'),
});

// ─── Config Schema ───
const ModelConfigInput = z.object({
  action: z.enum(['list', 'switch', 'set', 'reset']),
  plan: z.enum(['A', 'B', 'C']).optional().describe('Plan preset for switch/reset'),
  category: z.string().optional().describe('Category to override (for set)'),
  primary_model: z.string().optional().describe('Primary model (for set)'),
  fallback_model: z.string().optional().describe('Fallback model (for set)'),
});

// ─── Category definitions ───
const CATEGORY_NAMES: Record<string, string> = {
  high_logic: '高邏輯推理',
  code_generation: '代碼生成',
  creative_writing: '創意寫作',
  info_reading: '資訊閱讀',
  simple_repeat: '簡單重複',
  image_understanding: '圖片理解',
  image_generation: '圖片生成',
  video_audio: '影片/音頻',
};

// ─── Keyword rules (from task-rules.json) ───
interface CategoryRule {
  name: string;
  keywords: string[];
  input_patterns: string[];
  output_types: string[];
  weight: number;
  glm_keywords: string[];
}

const CATEGORY_RULES: Record<string, CategoryRule> = {
  high_logic: {
    name: '高邏輯推理',
    keywords: ['分析', '評估', '比較', '推理', '策略', '規劃', '論證', '評測', '策劃', '研究', '推算', '建模'],
    input_patterns: ['怎麼', '如何', '分析', '評估', '策劃', '計劃', '策略', '建議', '研究'],
    output_types: ['報告', '分析', '策略', '計劃', '方案', '評估'],
    weight: 1.0,
    glm_keywords: ['GLM-5推理', '複雜分析', '長程規劃'],
  },
  code_generation: {
    name: '代碼生成',
    keywords: ['代碼', '編程', '函數', 'class', 'debug', '重構', '程序', '腳本', '算法', '開發', 'AI編程', 'Vibe Coding'],
    input_patterns: ['寫', '生成', '創建', '開發', '编程', 'code', 'function', '幫我寫代碼', 'AI助手編程'],
    output_types: ['代碼', '程序', '腳本', '函數', 'class'],
    weight: 1.0,
    glm_keywords: ['GLM-5編程', 'GLM-4.7思考模式', 'AI軟件開發'],
  },
  creative_writing: {
    name: '創意寫作',
    keywords: ['創作', '故事', '編劇', '文案', '詩', '文章', '寫作', '內容', '脚本', '腳本'],
    input_patterns: ['寫', '創作', '編寫', '撰寫', '創作', '生動', '視頻腳本', '直播文案'],
    output_types: ['故事', '文案', '文章', '劇本', '詩', '內容', '腳本'],
    weight: 1.0,
    glm_keywords: ['創意內容', '長文本創作'],
  },
  info_reading: {
    name: '資訊閱讀',
    keywords: ['總結', '摘要', '翻譯', '閱讀', '解釋', '理解', '文檔', 'PDF', '報告', '搜索'],
    input_patterns: ['總結', '摘要', '翻譯', '閱讀', '解釋', '翻譯', '摘要', '幫我睇呢份文檔'],
    output_types: ['摘要', '翻譯', '解釋', '總結', '答案'],
    weight: 1.0,
    glm_keywords: ['長文檔閱讀', 'PDF總結', '多語翻譯'],
  },
  simple_repeat: {
    name: '簡單重複',
    keywords: ['格式化', '批量', '轉換', '整理', '替換', '快速處理'],
    input_patterns: ['格式化', '批量', '全部', '轉換', '整理', '快速'],
    output_types: ['格式化', '列表', '轉換結果'],
    weight: 1.0,
    glm_keywords: ['GLM-4-Flash快速模式'],
  },
  image_understanding: {
    name: '圖片理解',
    keywords: ['圖片', '截圖', '識別', 'OCR', '分析圖', '看圖', '視覺', '看圖說話'],
    input_patterns: ['截圖', '圖片', '分析', '識別', 'OCR', '視覺', '幫我睇呢張圖'],
    output_types: ['分析', '描述', '識別結果'],
    weight: 1.0,
    glm_keywords: ['GLM-4.6V視覺', 'GUI理解', '長視頻分析'],
  },
  image_generation: {
    name: '圖片生成',
    keywords: ['生成圖片', '畫', '設計', '海報', '創作圖片', '生成圖像', '文生圖'],
    input_patterns: ['生成', '畫', '設計', '創建', '幫我畫', '生成一張圖'],
    output_types: ['圖片', '圖像', '海報', '設計圖'],
    weight: 1.0,
    glm_keywords: ['CogView4漢字生成', 'GLM-Image商業設計'],
  },
  video_audio: {
    name: '影片/音頻',
    keywords: ['影片', '視頻', '音頻', '剪輯', '字幕', '語音', '語音對話', '配音'],
    input_patterns: ['影片', '視頻', '音頻', '剪輯', '字幕', '語音', '語音對話'],
    output_types: ['影片', '字幕', '音頻', '剪輯'],
    weight: 1.0,
    glm_keywords: ['GLM-4-Voice粵語', '情感語音', '方言對話'],
  },
};

const FALLBACK_MAP: Record<string, string> = {
  '語音識別': 'info_reading', '語音合成': 'creative_writing',
  '3D建模': 'image_generation', '數據分析': 'high_logic',
  '搜索研究': 'info_reading', '財務分析': 'high_logic',
  '科學研究': 'high_logic', '客戶服務': 'creative_writing',
  'AI編程': 'code_generation', 'Vibe Coding': 'code_generation',
  '長文檔': 'info_reading', '語音對話': 'video_audio',
};

// ─── Classification Engine ───
function classify(taskDescription: string): {
  category: string; category_name: string; confidence: number;
  matched_keywords: string[]; all_scores: Array<{ category: string; name: string; score: number }>;
} {
  const text = taskDescription.toLowerCase();
  const scores: Array<{ category: string; name: string; score: number }> = [];

  for (const [cat, rule] of Object.entries(CATEGORY_RULES)) {
    let score = 0;
    const matched: string[] = [];

    // Keyword matching (weighted by rule.weight)
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 2 * rule.weight;
        matched.push(kw);
      }
    }

    // Input pattern matching
    for (const pat of rule.input_patterns) {
      if (text.includes(pat.toLowerCase())) {
        score += 1.5 * rule.weight;
      }
    }

    // Output type matching
    for (const out of rule.output_types) {
      if (text.includes(out.toLowerCase())) {
        score += 1 * rule.weight;
      }
    }

    scores.push({ category: cat, name: rule.name, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const maxScore = best.score;

  // Confidence: ratio of best score to theoretical max
  const confidence = maxScore > 0 ? Math.min(1.0, maxScore / 8) : 0;

  // Collect all matched keywords from best category
  const bestRule = CATEGORY_RULES[best.category];
  const matchedKeywords: string[] = [];
  for (const kw of bestRule.keywords) {
    if (text.includes(kw.toLowerCase())) matchedKeywords.push(kw);
  }
  for (const pat of bestRule.input_patterns) {
    if (text.includes(pat.toLowerCase()) && !matchedKeywords.includes(pat)) matchedKeywords.push(pat);
  }

  // Try fallback mapping if confidence is very low
  if (confidence < 0.2) {
    for (const [key, cat] of Object.entries(FALLBACK_MAP)) {
      if (text.includes(key.toLowerCase())) {
        const rule = CATEGORY_RULES[cat];
        return {
          category: cat, category_name: rule.name, confidence: 0.5,
          matched_keywords: [key],
          all_scores: scores.map(s => ({ ...s, score: Math.round(s.score * 100) / 100 })),
        };
      }
    }

    // Ultimate fallback to high_logic
    const defaultRule = CATEGORY_RULES['high_logic'];
    return {
      category: 'high_logic',
      category_name: defaultRule.name,
      confidence: 0.3,
      matched_keywords: [],
      all_scores: scores.map(s => ({ ...s, score: Math.round(s.score * 100) / 100 })),
    };
  }

  return {
    category: best.category,
    category_name: best.name,
    confidence: Math.round(confidence * 100) / 100,
    matched_keywords: matchedKeywords,
    all_scores: scores.map(s => ({ ...s, score: Math.round(s.score * 100) / 100 })),
  };
}

// ─── Plan Config Loading ───
interface PlanConfig {
  plan_name: string;
  description: string;
  task_models: Record<string, {
    primary: string;
    fallback: string;
    cost_per_1M_output?: string;
    reason?: string;
  }>;
  routing_rule?: string;
  default_fallback?: string;
}

function loadPlanConfig(plan: string): PlanConfig {
  const configPath = resolve(__dirname, 'config', `plan-${plan.toLowerCase()}.json`);
  if (!existsSync(configPath)) {
    throw new Error(`Plan config not found: ${configPath}`);
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

// ─── Route Engine ───
function routeModel(
  taskDescription: string,
  availableModels: string[] | undefined,
  planPreset: string,
): { model: string; category: string; category_name: string; confidence: number; reason: string; plan_used: string; estimated_cost: string; } {
  const classification = classify(taskDescription);
  const plan = loadPlanConfig(planPreset);

  const taskModel = plan.task_models[classification.category];
  if (!taskModel) {
    // Fallback to high_logic
    const fallback = plan.task_models['high_logic'];
    return {
      model: fallback.primary,
      category: classification.category,
      category_name: classification.category_name,
      confidence: classification.confidence,
      reason: `No model config for category '${classification.category}', using high_logic fallback`,
      plan_used: plan.plan_name,
      estimated_cost: fallback.cost_per_1M_output || 'unknown',
    };
  }

  // If no available_models provided, use all from plan
  if (!availableModels || availableModels.length === 0) {
    return {
      model: taskModel.primary,
      category: classification.category,
      category_name: classification.category_name,
      confidence: classification.confidence,
      reason: taskModel.reason || `Plan ${planPreset} default for ${classification.category_name}`,
      plan_used: plan.plan_name,
      estimated_cost: taskModel.cost_per_1M_output || 'unknown',
    };
  }

  // Check if primary is available
  const primaryAvailable = availableModels.some(m =>
    m.toLowerCase().includes(taskModel.primary.toLowerCase()) ||
    taskModel.primary.toLowerCase().includes(m.toLowerCase())
  );

  if (primaryAvailable) {
    return {
      model: taskModel.primary,
      category: classification.category,
      category_name: classification.category_name,
      confidence: classification.confidence,
      reason: taskModel.reason || `Matched primary for ${classification.category_name}`,
      plan_used: plan.plan_name,
      estimated_cost: taskModel.cost_per_1M_output || 'unknown',
    };
  }

  // Check fallback
  const fallbackAvailable = availableModels.some(m =>
    m.toLowerCase().includes(taskModel.fallback.toLowerCase()) ||
    taskModel.fallback.toLowerCase().includes(m.toLowerCase())
  );

  if (fallbackAvailable) {
    return {
      model: taskModel.fallback,
      category: classification.category,
      category_name: classification.category_name,
      confidence: classification.confidence,
      reason: `Primary '${taskModel.primary}' not available, using fallback for ${classification.category_name}`,
      plan_used: plan.plan_name,
      estimated_cost: taskModel.cost_per_1M_output || 'unknown',
    };
  }

  // Fallback to any available model
  const defaultFallback = plan.default_fallback || availableModels[0];
  return {
    model: defaultFallback,
    category: classification.category,
    category_name: classification.category_name,
    confidence: classification.confidence,
    reason: `Preferred models not available. Using default fallback. Available: ${availableModels.join(', ')}`,
    plan_used: plan.plan_name,
    estimated_cost: 'unknown',
  };
}

// ─── MCP Handlers ───

export async function handleModelClassify(args: unknown) {
  const input = ModelClassifyInput.parse(args);
  const result = classify(input.task_description);
  return toMCPResponse(result);
}

export async function handleModelRoute(args: unknown) {
  const input = ModelRouteInput.parse(args);
  const result = routeModel(
    input.task_description,
    input.available_models,
    input.plan_preset,
  );
  return toMCPResponse(result);
}

export async function handleModelConfig(args: unknown) {
  const input = ModelConfigInput.parse(args);
  const db = getDb();

  // Ensure model_config table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_config (
      plan      TEXT NOT NULL DEFAULT 'B',
      category  TEXT NOT NULL,
      primary_model   TEXT NOT NULL,
      fallback_model  TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan, category)
    );
  `);

  const now = new Date().toISOString();

  switch (input.action) {
    case 'list': {
      const plan = input.plan || 'B';
      const rows = db.prepare(
        'SELECT * FROM model_config WHERE plan = ?'
      ).all(plan) as Array<{ plan: string; category: string; primary_model: string; fallback_model: string; updated_at: string }>;

      if (rows.length === 0) {
        // Seed from default plan config
        const planConfig = loadPlanConfig(plan);
        const insertStmt = db.prepare(
          'INSERT OR REPLACE INTO model_config (plan, category, primary_model, fallback_model, updated_at) VALUES (?, ?, ?, ?, ?)'
        );
        for (const [cat, cfg] of Object.entries(planConfig.task_models)) {
          insertStmt.run(plan, cat, cfg.primary, cfg.fallback, now);
        }
        const seeded = db.prepare('SELECT * FROM model_config WHERE plan = ?').all(plan) as any[];
        return toMCPResponse({
          active_plan: plan,
          plan_name: planConfig.plan_name,
          description: planConfig.description,
          categories: seeded.map(r => ({
            category: r.category,
            name: CATEGORY_NAMES[r.category] || r.category,
            primary: r.primary_model,
            fallback: r.fallback_model,
          })),
        });
      }

      const planConfig = loadPlanConfig(plan);
      return toMCPResponse({
        active_plan: plan,
        plan_name: planConfig.plan_name,
        description: planConfig.description,
        categories: rows.map(r => ({
          category: r.category,
          name: CATEGORY_NAMES[r.category] || r.category,
          primary: r.primary_model,
          fallback: r.fallback_model,
        })),
      });
    }

    case 'switch': {
      const plan = input.plan || 'B';
      const planConfig = loadPlanConfig(plan);
      // Re-seed for this plan
      db.prepare('DELETE FROM model_config WHERE plan = ?').run(plan);
      const insertStmt = db.prepare(
        'INSERT OR REPLACE INTO model_config (plan, category, primary_model, fallback_model, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const [cat, cfg] of Object.entries(planConfig.task_models)) {
        insertStmt.run(plan, cat, cfg.primary, cfg.fallback, now);
      }
      return toMCPResponse({
        switched_to: plan,
        plan_name: planConfig.plan_name,
        message: `Switched to Plan ${plan}. ${planConfig.description}`,
      });
    }

    case 'set': {
      if (!input.category || !input.primary_model) {
        return toMCPResponse({ error: 'category and primary_model required for set action' });
      }
      const plan = input.plan || 'B';
      db.prepare(`
        INSERT OR REPLACE INTO model_config (plan, category, primary_model, fallback_model, updated_at)
        VALUES (?, ?, ?, COALESCE(?, (SELECT fallback_model FROM model_config WHERE plan = ? AND category = ?)), ?)
      `).run(plan, input.category, input.primary_model,
        input.fallback_model || null, plan, input.category, now);
      return toMCPResponse({
        updated: { plan, category: input.category, primary: input.primary_model, fallback: input.fallback_model || '(unchanged)' },
      });
    }

    case 'reset': {
      const plan = input.plan || 'B';
      db.prepare('DELETE FROM model_config WHERE plan = ?').run(plan);
      const planConfig = loadPlanConfig(plan);
      const insertStmt = db.prepare(
        'INSERT OR REPLACE INTO model_config (plan, category, primary_model, fallback_model, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const [cat, cfg] of Object.entries(planConfig.task_models)) {
        insertStmt.run(plan, cat, cfg.primary, cfg.fallback, now);
      }
      return toMCPResponse({
        reset: plan,
        plan_name: planConfig.plan_name,
        message: `Reset Plan ${plan} to defaults`,
      });
    }

    default:
      return toMCPResponse({ error: `Unknown action: ${input.action}` });
  }
}
