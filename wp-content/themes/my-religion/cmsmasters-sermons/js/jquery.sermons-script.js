/**
 * @package 	WordPress
 * @subpackage 	My Religion
 * @version 	1.0.0
 * 
 * Theme Custom Scripts
 * Created by CMSMasters
 * 
 */


"use strict";

jQuery(document).ready(function() { 
	/* Audio Player Visibility */
	(function ($) { 
		$('.sermon .cmsmasters_sermon_media .cmsmasters_sermon_audio').on('click', function (i) { 
			var active_audio = $(this).parents('.sermon').find('.cmsmasters_sermon_audio.current_audio .cmsmasters_sermon_audio_content'), 
				toggle = $(this).parents('.cmsmasters_sermon_media'), 
				dropDown = toggle.find('.cmsmasters_sermon_audio_content');
			
			
			if (toggle.hasClass('current_audio')) {
				toggle.removeClass('current_audio');
			} else {
				toggle.addClass('current_audio');
			}
			
			
			i.preventDefault();
		} );
	} )(jQuery);
} );