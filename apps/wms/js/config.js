/**
* config.js — Configuracion de Supabase — Kubit-WMS
* ==================================================
* AMBIENTE DE PRODUCCION: proyecto gxqcybboiskwznxdioun
*
* Archivo exclusivo del repositorio KUBIT-PRODUCCION.
* Nunca copiar aqui el config.js de KUBIT-Pruebas (constitution.md, Articulo 15).
* Solo lleva la anon key (publica). El service_role NUNCA va en el frontend.
*
* Misma estructura que apps/pos/js/config.js.
*/
const ENTORNO = 'development'; // 'development' | 'production'
const CONFIG = {
development: {
supabaseUrl: 'https://gxqcybboiskwznxdioun.supabase.co',
supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4cWN5YmJvaXNrd3pueGRpb3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjcyNzcsImV4cCI6MjA5NTY0MzI3N30.5wt6GzJ0K80YoBCMlTIbqbF81yGZmaPFBhfoDbxI1Fc',
supabaseServiceKey: '' // Vacio a proposito: el WMS no lo usa
},
production: {
supabaseUrl: 'https://TU_PROYECTO_PROD.supabase.co',
supabaseAnonKey: 'tu-anon-key-de-produccion',
supabaseServiceKey: ''
}
};
const SUPABASE_URL = CONFIG[ENTORNO].supabaseUrl;
const SUPABASE_ANON_KEY = CONFIG[ENTORNO].supabaseAnonKey;
const SUPABASE_SERVICE_KEY = CONFIG[ENTORNO].supabaseServiceKey;
