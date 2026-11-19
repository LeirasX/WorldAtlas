# ORBIS progressive disclosure implementation plan

Goal: replace dense country pages and comparison defaults with a compact, visual overview without modifying country data.

Architecture: a pure presentation selector chooses one explicitly defined series for each glance concept. Source observations stay immutable and inspectable; alternatives remain in collapsed subject records. The existing map, data engine, storage and publication split remain intact.

1. Test presentation defaults, source/period preservation, unknown earnings basis, ambiguous language codes and incomplete climate data.
2. Build summary selectors and short display labels, leaving registry definitions unchanged.
3. Replace profile card walls with essential geography, one correctly scaled monthly climate chart, compact society/economy and collapsed subject records. Preserve notes, histories and source inspectors.
4. Add focused AI prompt generation, bounded relevant evidence, editable focus, clipboard feedback and manual-copy fallback. Show selected evidence before copying; never send it to an AI service.
5. Make comparison compact by default with explicit access to full records. Preserve sorting, filtering, export, column selection and statistics.
6. Reduce map/sidebar/topic copy and controls; keep search always available. Respect reduced motion and phone layouts.
7. Run unit, browser and production checks. Commit/push each ready increment and verify Pages. No raw data or private research publication.

Review focus: incompatible area definitions; median versus mean/net versus gross; dated legal benchmarks; local rent versus national data; missing months; clipboard permissions; mobile disclosure/focus; exhaustive records remain reachable.

Completed: compact profile and climate/table disclosures, qualified defaults, complete record access, guarded comparison differences, metric additions/fullscreen, focused prompt preview/copy/fallback, compact map and region controls, collapsible navigation, Topics lists, and reduced-motion rules. Browser checks caught and verified fixes for bottom navigation obscuring Statistics and duplicate territory-derived country labels. All underlying CSVs and metric definitions stayed unchanged.
