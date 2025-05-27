<?php

use Illuminate\Support\Facades\Route;

/* Root entry for the SPA */
Route::view('/', 'welcome');

/* ---  place additional backend routes here if needed  --- */
// Route::get('/api/…', …);

/* Catch-all: send every other URI to the SPA */
Route::view('/{any}', 'welcome')->where('any', '.*');
