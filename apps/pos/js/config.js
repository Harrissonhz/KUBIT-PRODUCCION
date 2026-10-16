/**
 * config.js — Configuracion de Supabase
 * ======================================
 * ATENCION: Archivo subido TEMPORALMENTE para pruebas en servidor remoto.
 * En produccion, excluir de Git (.gitignore).
 *
 * Soporta dos entornos: development (QA) y production.
 */

const ENTORNO = 'development'; // 'development' | 'production'

const CONFIG = {
  development: {
    supabaseUrl: 'https://gxqcybboiskwznxdioun.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4cWN5YmJvaXNrd3pueGRpb3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjcyNzcsImV4cCI6MjA5NTY0MzI3N30.5wt6GzJ0K80YoBCMlTIbqbF81yGZmaPFBhfoDbxI1Fc',
    supabaseServiceKey: ''
  },
  production: {
    supabaseUrl: 'https://TU_PROYECTO_PROD.supabase.co',
    supabaseAnonKey: 'tu-anon-key-de-produccion',
    supabaseServiceKey: 'tu-service-role-key-de-produccion'
  }
};

const SUPABASE_URL = CONFIG[ENTORNO].supabaseUrl;
const SUPABASE_ANON_KEY = CONFIG[ENTORNO].supabaseAnonKey;
const SUPABASE_SERVICE_KEY = CONFIG[ENTORNO].supabaseServiceKey;
