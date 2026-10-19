import 'dart:async';

import 'package:flutter/material.dart';

import 'campus_map_controller.dart';
import 'campus_place.dart';
import 'campus_place_category.dart';

/// Locais permanentes separados das listas de eventos e alimentação.
class CampusPlaceCategorySheet extends StatefulWidget {
  const CampusPlaceCategorySheet({
    super.key,
    required this.controller,
    this.initialCategory = CampusPlaceCategory.academic,
  });
  final CampusPlaceCategory initialCategory;
  final CampusMapController controller;

  @override
  State<CampusPlaceCategorySheet> createState() => _CategorySheetState();
}

class _CategorySheetState extends State<CampusPlaceCategorySheet> {
  final _query = TextEditingController();
  late CampusPlaceCategory _category;
  List<CampusPlace> _places = const [];
  bool _loading = true;
  bool _failed = false;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
    unawaited(_load());
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final places = await widget.controller.placesInCategory(
        _category,
        query: _query.text,
      );
      if (!mounted || request != _request) return;
      setState(() {
        _places = places;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || request != _request) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _request++;
    _query.dispose();
    super.dispose();
  }

  IconData _icon(CampusPlaceCategory category) => switch (category) {
    CampusPlaceCategory.academic => Icons.school_outlined,
    CampusPlaceCategory.lab => Icons.biotech_outlined,
    CampusPlaceCategory.library => Icons.local_library_outlined,
    CampusPlaceCategory.sports => Icons.sports_soccer_outlined,
  };

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: SizedBox(
      height:
          (MediaQuery.sizeOf(context).height -
              MediaQuery.viewInsetsOf(context).bottom) *
          .8,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: CustomScrollView(
          key: const Key('campus-category-results'),
          slivers: [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Locais do campus',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final category in CampusPlaceCategory.values)
                        ChoiceChip(
                          key: Key('campus-category-${category.name}'),
                          avatar: Icon(_icon(category), size: 18),
                          label: Text(category.label),
                          selected: category == _category,
                          onSelected: (selected) {
                            if (!selected) return;
                            setState(() => _category = category);
                            unawaited(_load());
                          },
                        ),
                    ],
                  ),
                  if (_category == CampusPlaceCategory.academic)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        'Prédios de ensino e apoio classificados como acadêmicos no PUCMaps.',
                      ),
                    ),
                  TextField(
                    key: const Key('campus-category-query'),
                    controller: _query,
                    onChanged: (_) => unawaited(_load()),
                    decoration: InputDecoration(
                      labelText: 'Nome ou código nesta categoria',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: IconButton(
                        tooltip: 'Limpar filtro da categoria',
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _query.clear();
                          unawaited(_load());
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            if (!_loading && !_failed && _places.isNotEmpty)
              SliverList.builder(
                itemCount: _places.length,
                itemBuilder: (context, index) {
                  final place = _places[index];
                  return ListTile(
                    key: Key('campus-category-place-${place.id}'),
                    leading: Icon(_icon(_category)),
                    title: Text(place.displayName),
                    subtitle: place.code == null
                        ? null
                        : Text('Código ${place.code}'),
                    onTap: () => Navigator.of(context).pop(place),
                  );
                },
              )
            else
              SliverFillRemaining(
                hasScrollBody: false,
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _failed
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('Não foi possível carregar os locais.'),
                            TextButton(
                              onPressed: _load,
                              child: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      )
                    : const Center(
                        child: Text(
                          'Nenhum local nesta categoria para esta busca.',
                        ),
                      ),
              ),
          ],
        ),
      ),
    ),
  );
}
