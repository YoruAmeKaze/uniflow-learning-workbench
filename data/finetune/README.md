# UniFlow 百炼微调数据集

这是一套与 `backend/src/services/agent.ts` 中意图识别协议一致的合成数据集，可用于阿里云百炼 Qwen 监督微调（SFT）。

## 文件

- `train.jsonl`：训练集（141 条）
- `validation.jsonl`：验证集（26 条）
- `test.jsonl`：独立测试集（32 条，禁止上传为训练数据）
- `stats.json`：各分片数量和意图分布
- `../scripts/generate-finetune-dataset.mjs`：可重复生成脚本

每行都是一条 OpenAI/Qwen 对话样本：`system → user → assistant`。assistant 的 `content` 是 JSON 字符串，字段固定为：

```json
{
  "intent": "todo|knowledge|none",
  "todos": [],
  "knowledge": null,
  "reply": "给用户的中文回复"
}
```

## 百炼上传建议

1. 在百炼「数据管理」分别创建训练集和验证集。
2. 上传 `train.jsonl` 作为训练数据，上传 `validation.jsonl` 作为验证数据。
3. 数据格式选择对话（messages）格式；若控制台要求选择角色字段，保持 `system/user/assistant` 映射。
4. `test.jsonl` 只保留在本地，训练完成后用于基础模型与微调模型的对比评测。

## 数据边界

- 数据全部为合成校园场景，不含真实姓名、学号、账号、密码或 API Key。
- 日期以 2026 年秋季学期为示例；实际评测时应将相对日期样本按评测当天重新生成或在 system prompt 中固定日期。
- 微调只学习意图、字段抽取和回复风格；校园事实仍应通过 RAG 知识库提供。

重新生成：

```powershell
node backend/scripts/generate-finetune-dataset.mjs
```
