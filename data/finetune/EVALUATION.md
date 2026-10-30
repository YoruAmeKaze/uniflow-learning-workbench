# 百炼评测集上传说明

百炼的模型评测入口使用官方 `Testdata.xlsx` 模板（两列：`Prompt`、`Completion`），这和 SFT 训练集的 JSONL 上传入口不同。

运行导出脚本后会生成 `bailian-eval.xlsx`，严格复用 `D:\Downloads\Testdata.xlsx` 的工作簿结构，包含 32 条独立测试样本：`Prompt` 是用户输入，`Completion` 是标准 JSON 字符串。

上传时直接选择该文件，不需要再做列映射。如果控制台提示模板版本不一致，请先从页面下载最新模板替换 `D:\Downloads\Testdata.xlsx`，再运行脚本。不要把 `train.jsonl` 或 `validation.jsonl` 当成评测集上传。

```powershell
python data/finetune/export-bailian-eval.py
```
