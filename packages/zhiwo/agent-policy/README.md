# @deepseek-ai/dsh-zhiwo-agent-policy

English | [中文](README.zh.md)

This private Zhiwo plugin confines the `read`, `glob`, and `grep` discovery tools to the current Session workspace. It is mounted by the shipped [`zhiwo` preset](../../../apps/cli/config/agent-presets/zhiwo/agent.cordis.yml) after those tools register.

Before dispatch, the plugin rejects absolute, Windows, backslash, and NUL-containing path syntax. It resolves the Session cwd and requested target through the configured filesystem provider, then requires canonical containment. This last check also rejects `..` traversal and symbolic links whose real target is outside the workspace. Resolution failures return one fixed denial without exposing provider paths.

After a successful `read`, the plugin replaces the provider display path with the normalized request-relative path. File content is unchanged. Other tools and denied results delegate through the ordinary tool waterfalls.

## Model Experience

### Conditional tool result

#### What the model sees

Allowed reads retain their content and expose a relative path. An out-of-workspace discovery attempt returns `Zhiwo tools can only access the provided materials.` instead of file content, filesystem placement, or a provider diagnostic.

#### Token effect

Allowed calls add no content. A denied call adds one short retained tool result.

#### KV Cache effect

Append-only; the policy changes only the current tool result and does not invalidate an existing request prefix.

## Known Limitations and Deferred Work

- The plugin constrains filesystem discovery tools, not independent capabilities added to a different preset. The shipped Zhiwo preset deliberately exposes only `read`, `glob`, and `grep`.
- A file below the workspace can still contain inaccurate or private material. Persona evidence rules and the Zhiwo publication guard separately control what may be asserted or shown.
