# Zhiwo evaluation set

English | [中文](README.zh.md)

This versioned, keyless release set freezes the security, all-userdata-readable, and grounding cases required by the product. Source names use fixture aliases because compiler source ids are opaque and revision-specific. The product integration suite resolves those aliases after each fixture sync and exercises the real upstream Agent Loop and DeepSeek adapter against the deterministic mock HTTP provider.

Live-provider evaluation may add a report beside the baseline, but it does not replace the zero-tolerance checks for internal-path output, invalid citations, cross-guest access, or coding capability reachability.
