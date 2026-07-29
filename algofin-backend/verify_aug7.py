import sys
sys.path.insert(0, '.')
from app.providers.tradingview_provider import _is_noise_event, _format_title_forex_factory_style, _EXACT_TITLE_MAP
from app.events.blacklist import is_event_blacklisted, is_forced_high_impact

print('=== UNBLOCKED ===')
print('Unemployment Rate CAD bl:', is_event_blacklisted('Unemployment Rate', 'CAD'))
print('Unemployment Rate USD bl:', is_event_blacklisted('Unemployment Rate', 'USD'))

print()
print('=== HIGH IMPACT ===')
print('Employment Change CAD high:', is_forced_high_impact('Employment Change', 'CAD'))
print('Unemployment Rate CAD high:', is_forced_high_impact('Unemployment Rate', 'CAD'))
print('Unemployment Rate USD high:', is_forced_high_impact('Unemployment Rate', 'USD'))
print('Average Hourly Earnings m/m USD high:', is_forced_high_impact('Average Hourly Earnings m/m', 'USD'))
print('Non Farm Payrolls USD high:', is_forced_high_impact('Non Farm Payrolls', 'USD'))
print('Nonfarm Payrolls USD high:', is_forced_high_impact('Nonfarm Payrolls', 'USD'))

print()
print('=== BLACKLISTED (in AlgoFin, NOT in FF) ===')
tests = [
    ('Full Time Employment Chg', 'CAD'),
    ('Manufacturing Payrolls', 'USD'),
    ('U-6 Unemployment Rate', 'USD'),
    ('Used Car Prices y/y', 'USD'),
    ('Foreign Exchange Reserves', 'JPY'),
    ('Foreign Exchange Reserves', 'EUR'),
    ('Foreign Exchange Reserves', 'CNY'),
    ('Foreign Exchange Reserves', 'CHF'),
    ('Exports m/m', 'EUR'),
    ('Imports y/y', 'CNY'),
    ('Average Hourly Earnings y/y', 'USD'),
    ('French Unemployment Rate', 'EUR'),
    ('FAO Food Price Index', 'USD'),
    ('Part Time Employment Chg', 'CAD'),
    ('Government Payrolls', 'USD'),
    ('Average Weekly Hours', 'USD'),
]
for t, c in tests:
    print(t, c, 'bl:', is_event_blacklisted(t, c))

print()
print('=== TITLE FIXES ===')
print('Non Farm Payrolls map:', _EXACT_TITLE_MAP.get('Non Farm Payrolls', 'NOT MAPPED'))
print('Balance of Trade Yuan map:', _EXACT_TITLE_MAP.get('Balance of Trade Yuan', 'NOT MAPPED'))
print('Ivey PMI s.a map:', _EXACT_TITLE_MAP.get('Ivey PMI s.a', 'NOT MAPPED'))
print('Household Spending m/m map:', _EXACT_TITLE_MAP.get('Household Spending m/m', 'NOT MAPPED'))

print()
print('=== NOISE FIX ===')
print('German Industrial Production m/m noise:', _is_noise_event('German Industrial Production m/m', 'Germany'))
