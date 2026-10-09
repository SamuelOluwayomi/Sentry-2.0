import re

# 1. Patch lib/network-snapshot.ts
with open('lib/network-snapshot.ts', 'r') as f:
    snap_content = f.read()

snap_target = '''  } catch {
    // all oracles failed
  }

  throw new Error(
