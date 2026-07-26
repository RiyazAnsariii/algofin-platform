import httpx, json

# Simulate what Vercel does — call the rewrite destination directly
# with no auth token to see what comes back
r = httpx.get(
    'https://algofin-api.onrender.com/api/v1/economic-calendar',
    params={'days': 30},
    timeout=30
)
d = r.json()
print('Status:', r.status_code)
print('Top-level keys:', list(d.keys()))
print()
print('Summary object:', d.get('summary'))
print('Summary type:', type(d.get('summary')))
print()
print('Metadata:', d.get('metadata'))
print('Events count:', len(d.get('events', [])))
print()
# Check if it's wrapped in a data field
if 'data' in d:
    print('WARNING: Response is wrapped in data key!')
    print('data.summary:', d['data'].get('summary'))
