mod commands;
mod error;
mod logging;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::read_pdf_file,
            commands::write_pdf_file,
            commands::get_pdf_info,
            commands::get_recent_files,
            commands::add_recent_file,
            commands::load_annotations,
            commands::save_annotations,
            commands::save_pdf_with_annotations,
            commands::prepare_document_bytes,
            commands::delete_pdf_pages,
            commands::rotate_pdf_pages,
            commands::reorder_pdf_pages,
            commands::insert_blank_pages,
            commands::extract_pdf_pages,
            commands::merge_pdfs,
            commands::apply_content_edits,
            commands::inspect_pdf_forms,
            commands::apply_form_values,
            commands::create_form_fields,
            commands::flatten_pdf_forms,
            commands::inspect_pdf_security,
            commands::encrypt_pdf,
            commands::decrypt_pdf,
            commands::log_frontend_event,
            commands::get_logging_info,
            commands::read_recent_log_lines,
            commands::update::check_for_updates,
            commands::update::apply_app_update,
        ])
        .setup(|app| {
            tracing::info!(app_version = env!("CARGO_PKG_VERSION"), "PDF Editor started");
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
