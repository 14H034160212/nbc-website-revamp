<?php
/**
 * Northcote Baptist Church — child theme functions.
 *
 * The child theme previously contained no functions.php at all. Everything
 * here is additive: nothing in the parent theme `my-religion` is modified,
 * so the parent can still be updated.
 *
 * Sections
 *   0  Settings          — the only block you normally need to edit
 *   1  Skip link         — keyboard/screen-reader entry point
 *   2  Language switcher — works with or without Polylang
 *   3  hreflang          — only emitted when Polylang is not handling it
 *   4  Structured data   — schema.org Church + Sunday service
 *   5  Mobile action bar — Sunday / directions / give
 *   6  Asset slimming    — stop loading plugin CSS/JS on pages that never use it
 *   7  Debug helper      — prints every enqueued handle, for step 6
 *
 * @package my-religion-child
 */

defined( 'ABSPATH' ) || exit;


/* =====================================================================
   0  SETTINGS
   Fill these in once. Values marked TODO are not published anywhere on
   the current site, so they could not be copied across — someone at the
   church needs to supply them.
   ================================================================== */

/**
 * Street address. The website itself has never published one — this came from
 * the church's Google Business listing and is corroborated by OpenStreetMap,
 * which carries the building as a place_of_worship at these coordinates.
 * Worth one glance from someone at the church before it goes live.
 */
define( 'NBC_STREET', '67 Eban Avenue' );
define( 'NBC_SUBURB', 'Hillcrest' );
define( 'NBC_CITY',   'Auckland' );
define( 'NBC_POSTCODE', '0627' );
define( 'NBC_LAT',    '-36.7954715' );
define( 'NBC_LNG',    '174.7360854' );

define( 'NBC_PHONE',  '+64 9 480 7064' );        // displayed as (09) 480 7064
define( 'NBC_EMAIL',  'office@nbc.org.nz' );

/** Sunday service. */
define( 'NBC_SERVICE_TIME',  '10:00' );
define( 'NBC_SERVICE_ENDS',  '11:15' );

/**
 * Office hours, from the church's Google listing.
 *
 * Distinct from the service: the listing also shows Sunday 10:00-12:30, but
 * that is the building being open for the service and morning tea, not the
 * office being staffed. Both belong in openingHoursSpecification, which means
 * "when is this place open"; only the weekday hours belong next to the phone
 * number, which is what a person is actually asking when they look this up.
 */
define( 'NBC_OFFICE_OPENS', '09:00' );
define( 'NBC_OFFICE_CLOSES', '15:00' );
define( 'NBC_SUNDAY_OPENS', '10:00' );
define( 'NBC_SUNDAY_CLOSES', '12:30' );

/**
 * Language landing pages. Key = hreflang code, value = path on this site.
 * Leave a value empty to hide that language until its page exists.
 */
function nbc_languages() {
	return array(
		'en'      => array( 'label' => 'English',       'path' => '/' ),
		'zh-Hans' => array( 'label' => '中文',          'path' => '/zh/' ),
		'ko'      => array( 'label' => '한국어',        'path' => '/ko/' ),
		'mi'      => array( 'label' => 'Te Reo Māori',  'path' => '/mi/' ),
	);
}

/** Set to a registered nav-menu location to put the switcher inside that
 *  menu instead of in its own strip. Find valid values by adding
 *  ?nbc_debug=menus to any URL while logged in as an administrator. */
define( 'NBC_MENU_LOCATION', '' );


/* =====================================================================
   1  SKIP LINK
   ================================================================== */

/**
 * `wp_body_open()` arrived in WordPress 5.2 and themes have to call it
 * themselves. `my-religion` predates that and may not, so anything hooked
 * there can silently never render. Track whether the hook actually fired;
 * if it did not, section 5 re-inserts the same markup from the footer.
 */
function nbc_body_open_fired( $set = false ) {
	static $fired = false;
	if ( $set ) {
		$fired = true;
	}
	return $fired;
}

add_action( 'wp_body_open', 'nbc_top_markup', 1 );
function nbc_top_markup() {
	nbc_body_open_fired( true );
	echo '<a class="nbc-skip" href="#nbc-main">' . esc_html__( 'Skip to content', 'my-religion-child' ) . '</a>';
	nbc_language_strip();
}

/**
 * Two jobs, both done from the footer so no parent template is touched:
 *
 *   1. Give the content wrapper an id, so the skip link has a target.
 *   2. If the theme never called wp_body_open(), emit the skip link and
 *      language strip here and move them to the top of <body>.
 */
add_action( 'wp_footer', 'nbc_footer_bootstrap', 5 );
function nbc_footer_bootstrap() {

	$needs_fallback = ! nbc_body_open_fired();

	if ( $needs_fallback ) {
		echo '<template id="nbc-top-fallback">';
		echo '<a class="nbc-skip" href="#nbc-main">' . esc_html__( 'Skip to content', 'my-religion-child' ) . '</a>';
		nbc_language_strip();
		echo '</template>';
	}
	?>
	<script>
	(function () {
		var main = document.querySelector('.middle_content, .content_wrap, #middle');
		if (main && !document.getElementById('nbc-main')) {
			main.id = 'nbc-main';
			main.setAttribute('tabindex', '-1');
		}
		var tpl = document.getElementById('nbc-top-fallback');
		if (tpl && tpl.content) {
			document.body.insertBefore(tpl.content, document.body.firstChild);
			tpl.remove();
		}
	})();
	</script>
	<?php
}


/* =====================================================================
   2  LANGUAGE SWITCHER
   Renders Polylang's list when Polylang is active, and a plain list of
   landing-page links when it is not — so the switcher works from day one
   and keeps working after Polylang is installed.
   ================================================================== */

/**
 * Build the switcher markup.
 *
 * @return string
 */
function nbc_language_switcher() {

	// Polylang present: let it decide what is available and what is current.
	if ( function_exists( 'pll_the_languages' ) ) {
		$items = pll_the_languages(
			array(
				'raw'                    => 1,
				'hide_if_no_translation' => 0,
				'echo'                   => 0,
			)
		);

		if ( empty( $items ) || ! is_array( $items ) ) {
			return '';
		}

		$out = '<ul class="nbc-lang">';
		foreach ( $items as $item ) {
			$out .= sprintf(
				'<li class="nbc-lang__item%1$s"><a class="nbc-lang__link" href="%2$s" lang="%3$s" hreflang="%3$s">%4$s</a></li>',
				! empty( $item['current_lang'] ) ? ' is-current' : '',
				esc_url( $item['url'] ),
				esc_attr( $item['locale'] ),
				esc_html( $item['name'] )
			);
		}
		return $out . '</ul>';
	}

	// No Polylang: static links to the landing pages.
	$request = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
	$current = untrailingslashit( (string) wp_parse_url( $request, PHP_URL_PATH ) );
	$out     = '<ul class="nbc-lang">';

	foreach ( nbc_languages() as $code => $lang ) {
		if ( '' === $lang['path'] ) {
			continue;
		}
		$is_current = untrailingslashit( $lang['path'] ) === $current;

		$out .= sprintf(
			'<li class="nbc-lang__item%1$s"><a class="nbc-lang__link" href="%2$s" lang="%3$s" hreflang="%3$s">%4$s</a></li>',
			$is_current ? ' is-current' : '',
			esc_url( home_url( $lang['path'] ) ),
			esc_attr( $code ),
			esc_html( $lang['label'] )
		);
	}

	return $out . '</ul>';
}

/** Shortcode form, for dropping into a page or a widget: [nbc_languages] */
add_shortcode( 'nbc_languages', 'nbc_language_switcher' );

/**
 * Default placement: a slim strip at the very top of the page, above the
 * theme header. Chosen because it needs no knowledge of the parent theme's
 * markup and therefore cannot break it. Called from nbc_top_markup().
 */
function nbc_language_strip() {
	if ( NBC_MENU_LOCATION ) {
		return; // The switcher is going into the nav menu instead.
	}
	$switcher = nbc_language_switcher();
	if ( ! $switcher ) {
		return;
	}
	echo '<div class="nbc-langbar"><div class="nbc-langbar__inner">' . $switcher . '</div></div>';
}

/** Optional placement: append the switcher to a nav menu. */
add_filter( 'wp_nav_menu_items', 'nbc_language_menu_item', 10, 2 );
function nbc_language_menu_item( $items, $args ) {
	if ( ! NBC_MENU_LOCATION || empty( $args->theme_location ) ) {
		return $items;
	}
	if ( NBC_MENU_LOCATION !== $args->theme_location ) {
		return $items;
	}
	return $items . '<li class="menu-item nbc-lang-menu-item">' . nbc_language_switcher() . '</li>';
}


/* =====================================================================
   3  hreflang
   Tells Google that these pages are alternates of one another. Skipped
   entirely when Polylang is active, because Polylang emits its own.
   ================================================================== */

add_action( 'wp_head', 'nbc_hreflang', 2 );
function nbc_hreflang() {
	if ( function_exists( 'pll_the_languages' ) ) {
		return;
	}
	foreach ( nbc_languages() as $code => $lang ) {
		if ( '' === $lang['path'] ) {
			continue;
		}
		printf(
			'<link rel="alternate" hreflang="%s" href="%s" />' . "\n",
			esc_attr( $code ),
			esc_url( home_url( $lang['path'] ) )
		);
	}
	printf(
		'<link rel="alternate" hreflang="x-default" href="%s" />' . "\n",
		esc_url( home_url( '/' ) )
	);
}


/* =====================================================================
   4  STRUCTURED DATA
   Lets Google show the service time and address directly in local
   results. Only fields that are actually filled in are emitted — an
   empty address is worse than no address.
   ================================================================== */

add_action( 'wp_head', 'nbc_schema', 20 );
function nbc_schema() {
	if ( ! is_front_page() ) {
		return;
	}

	$schema = array(
		'@context'      => 'https://schema.org',
		'@type'         => 'Church',
		'name'          => 'Northcote Baptist Church',
		'url'           => home_url( '/' ),
		'telephone'     => NBC_PHONE,
		'email'         => NBC_EMAIL,
		'knowsLanguage' => array_keys( nbc_languages() ),
	);

	$address = array_filter(
		array(
			'@type'           => 'PostalAddress',
			'streetAddress'   => NBC_STREET,
			'addressLocality' => NBC_SUBURB,
			'addressRegion'   => NBC_CITY,
			'postalCode'      => NBC_POSTCODE,
			'addressCountry'  => 'NZ',
		)
	);
	if ( NBC_STREET ) {
		$schema['address'] = $address;
	}

	if ( NBC_LAT && NBC_LNG ) {
		$schema['geo'] = array(
			'@type'     => 'GeoCoordinates',
			'latitude'  => NBC_LAT,
			'longitude' => NBC_LNG,
		);
	}

	$schema['openingHoursSpecification'] = array(
		array(
			'@type'     => 'OpeningHoursSpecification',
			'dayOfWeek' => array( 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday' ),
			'opens'     => NBC_OFFICE_OPENS,
			'closes'    => NBC_OFFICE_CLOSES,
		),
		array(
			'@type'     => 'OpeningHoursSpecification',
			'dayOfWeek' => 'Sunday',
			'opens'     => NBC_SUNDAY_OPENS,
			'closes'    => NBC_SUNDAY_CLOSES,
		),
	);

	$schema['event'] = array(
		'@type'         => 'Event',
		'name'          => 'Sunday Service',
		'description'   => 'Family-friendly service with a mix of traditional and contemporary worship, prayer and a message. Children\'s programmes run during term time.',
		'eventSchedule' => array(
			'@type'      => 'Schedule',
			'byDay'      => 'https://schema.org/Sunday',
			'startTime'  => NBC_SERVICE_TIME,
			'endTime'    => NBC_SERVICE_ENDS,
			'repeatFrequency' => 'P1W',
			'scheduleTimezone' => 'Pacific/Auckland',
		),
		'organizer'     => array(
			'@type' => 'Organization',
			'name'  => 'Northcote Baptist Church',
			'url'   => home_url( '/' ),
		),
	);

	echo '<script type="application/ld+json">'
		. wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		. '</script>' . "\n";
}


/* =====================================================================
   5  MOBILE ACTION BAR
   ================================================================== */

add_filter( 'body_class', 'nbc_body_class' );
function nbc_body_class( $classes ) {
	$classes[] = 'nbc-has-actionbar';
	return $classes;
}

add_action( 'wp_footer', 'nbc_action_bar', 20 );
function nbc_action_bar() {

	// Directions: use a map link when there is an address, otherwise send
	// people to the contact page rather than to a broken map search.
	if ( NBC_STREET ) {
		$map_query = rawurlencode( NBC_STREET . ', ' . NBC_SUBURB . ', ' . NBC_CITY . ', New Zealand' );
		$map_url   = 'https://www.google.com/maps/search/?api=1&query=' . $map_query;
	} else {
		$map_url = home_url( '/contact/' );
	}
	?>
	<nav class="nbc-actionbar" aria-label="<?php esc_attr_e( 'Quick links', 'my-religion-child' ); ?>">
		<a class="nbc-actionbar__link" href="<?php echo esc_url( home_url( '/services/' ) ); ?>">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
			<span><?php esc_html_e( 'Sunday 10am', 'my-religion-child' ); ?></span>
		</a>
		<a class="nbc-actionbar__link" href="<?php echo esc_url( $map_url ); ?>">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
			<span><?php esc_html_e( 'Find us', 'my-religion-child' ); ?></span>
		</a>
		<a class="nbc-actionbar__link" href="<?php echo esc_url( home_url( '/give-2/' ) ); ?>">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 6.6a4.3 4.3 0 0 0-6.1 0L12 9.3 9.3 6.6a4.3 4.3 0 1 0-6.1 6.1L12 21.5l8.8-8.8a4.3 4.3 0 0 0 0-6.1z"/></svg>
			<span><?php esc_html_e( 'Give', 'my-religion-child' ); ?></span>
		</a>
	</nav>
	<?php
}


/* =====================================================================
   6  ASSET SLIMMING
   Every page currently loads 32 stylesheets and 27 scripts, including a
   timetable carousel, a tooltip library, an Instagram feed and a slider
   that most pages never show. Handles below were read off the live HTML.

   Roll this out one block at a time on staging: comment everything out,
   enable one block, click through the site, then enable the next.
   ================================================================== */

add_action( 'wp_enqueue_scripts', 'nbc_slim_assets', 100 );
function nbc_slim_assets() {

	if ( is_admin() ) {
		return;
	}

	// --- LayerSlider: only the front page runs a slider -------------------
	if ( ! is_front_page() ) {
		wp_dequeue_style( 'layerslider' );
		wp_dequeue_script( 'layerslider' );
		wp_dequeue_script( 'layerslider-transitions' );
		wp_dequeue_script( 'layerslider-greensock' );
	}

	// --- Timetable + its carousel/tooltip stack --------------------------
	// Used by the calendar page only.
	if ( ! is_page( array( 'our-calendar', 'events' ) ) ) {
		wp_dequeue_style( 'timetable_gtip2_style' );
		wp_dequeue_style( 'timetable_font_lato' );
		wp_dequeue_style( 'theme-cmsmasters-timetable-style' );
		wp_dequeue_style( 'theme-cmsmasters-timetable-adaptive' );
		wp_dequeue_script( 'timetable_main' );
		wp_dequeue_script( 'jquery-carouFredSel' );
		wp_dequeue_script( 'jquery-ba-bqq' );
		wp_dequeue_script( 'jquery-qtip2' );
	}

	// --- Simple Calendar (Google Calendar Events) ------------------------
	if ( ! is_page( array( 'our-calendar', 'events' ) ) && ! is_front_page() ) {
		wp_dequeue_style( 'simcal-default-calendar-grid' );
		wp_dequeue_style( 'simcal-default-calendar-list' );
		wp_dequeue_style( 'simcal-qtip' );
		wp_dequeue_script( 'simcal-default-calendar' );
		wp_dequeue_script( 'simcal-qtip' );
		wp_dequeue_script( 'simplecalendar-imagesloaded' );
	}

	// --- Instagram feed --------------------------------------------------
	if ( ! is_page( array( 'community', 'youth' ) ) && ! is_front_page() ) {
		wp_dequeue_style( 'sbi_styles' );
	}

	// --- YouTube embed helper: sermons and any page with a video ---------
	if ( ! is_singular( 'cmsmasters_sermon' ) && ! is_post_type_archive( 'cmsmasters_sermon' ) && ! is_page( 'sermons' ) ) {
		wp_dequeue_style( '__EPYT__style' );
		wp_dequeue_script( '__ytprefs__' );
		wp_dequeue_script( '__ytprefsfitvids__' );
	}

	// --- Twitter widget: there is no Twitter feed on the site ------------
	wp_dequeue_script( 'twitter' );

	// --- Contact Form 7: only pages that actually contain a form ---------
	if ( ! is_page( array( 'contact', 'zh', 'ko', 'mi' ) ) ) {
		wp_dequeue_style( 'contact-form-7' );
		wp_dequeue_script( 'contact-form-7' );
		wp_dequeue_script( 'swv' );
	}
}


/* =====================================================================
   7  DEBUG HELPER
   Visit any page as an administrator with ?nbc_debug=assets to list the
   handles actually loading on that page, or ?nbc_debug=menus to list the
   registered nav-menu locations. Nothing is printed for anyone else.
   ================================================================== */

add_action( 'wp_footer', 'nbc_debug', 999 );
function nbc_debug() {

	if ( ! current_user_can( 'manage_options' ) || empty( $_GET['nbc_debug'] ) ) {
		return;
	}

	$what = sanitize_key( wp_unslash( $_GET['nbc_debug'] ) );

	echo '<pre style="position:relative;z-index:99999;margin:0;padding:20px;background:#1b1e26;color:#e8eaf0;font:12px/1.6 ui-monospace,monospace;overflow:auto">';

	if ( 'menus' === $what ) {
		echo "REGISTERED NAV MENU LOCATIONS\n";
		foreach ( get_registered_nav_menus() as $location => $label ) {
			echo esc_html( sprintf( "  %-22s %s\n", $location, $label ) );
		}
	} else {
		global $wp_styles, $wp_scripts;

		$styles  = ( $wp_styles instanceof WP_Styles ) ? (array) $wp_styles->done : array();
		$scripts = ( $wp_scripts instanceof WP_Scripts ) ? (array) $wp_scripts->done : array();

		echo 'STYLES (' . count( $styles ) . ")\n";
		foreach ( $styles as $handle ) {
			echo esc_html( '  ' . $handle . "\n" );
		}
		echo "\nSCRIPTS (" . count( $scripts ) . ")\n";
		foreach ( $scripts as $handle ) {
			echo esc_html( '  ' . $handle . "\n" );
		}
	}

	echo '</pre>';
}
