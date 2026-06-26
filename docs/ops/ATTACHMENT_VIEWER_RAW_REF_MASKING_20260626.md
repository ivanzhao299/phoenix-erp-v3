# Attachment Viewer Raw Reference Masking - 2026-06-26

## 背景

生产 readiness P1 要求继续收口历史 `/uploads` 兼容风险，并避免前端附件入口透传裸 URL、`/uploads` 路径或存储路径。

## 发现

统一上传组件已经拒绝服务端裸链接返回，上传后优先保存受控 `fileId`。

只读附件查看组件 `AttachmentViewer` 虽然没有渲染可点击链接，但在遇到历史裸 URL 或 `/uploads` 引用时，会把原始字符串显示出来。这仍属于“向用户透传历史裸路径”的风险。

## 修复内容

修改：

- `apps/web/src/components/design-system/detail/AttachmentViewer.tsx`

修复：

1. 继续识别 `http(s)` 和 `/uploads` 历史裸引用。
2. 保持“历史裸链接已禁用”的显式提示。
3. 不再显示原始 URL/path 文本。
4. 改为显示“已按安全策略脱敏”。
5. 受控 `FILE-*` 引用仍正常显示。

## 安全边界

- 未修改后端。
- 未修改数据库。
- 未执行 migration。
- 未改变附件上传或下载能力。
- 未打开任何历史裸路径。

## 验证

- Web typecheck：待本批提交前执行。
- W5 closeout gate：待本批提交前执行。

## 结论

GO WITH CONDITIONS。

该修复降低历史附件引用在详情页被动泄露风险。后续仍需持续推进历史附件 owner correlation 与 protected endpoint 覆盖。
