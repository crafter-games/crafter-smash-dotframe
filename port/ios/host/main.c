// iOS host for the Crafter Smash library: SDL3 owns the app lifecycle through main callbacks and drives the
// scriptc library (init once, frame per display refresh). Events go to the dotframe shim; the library reads them.
#define SDL_MAIN_USE_CALLBACKS 1
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <stdint.h>
#include <string.h>

void smash_runtime_init(void);
int32_t smash_register_callbacks(void);
void smash_init(const uint8_t *base, int64_t base_len);
uint8_t smash_frame(double time);
void df_handle_event(const SDL_Event *event);
void df_close(void);

static Uint64 g_start;

SDL_AppResult SDL_AppInit(void **appstate, int argc, char **argv) {
  (void)appstate;
  (void)argc;
  (void)argv;
  smash_runtime_init();
  int32_t failed = smash_register_callbacks();
  if (failed != 0) {
    SDL_Log("crafter-smash: %d callbacks failed to register", failed);
    return SDL_APP_FAILURE;
  }
  // The bundle's resource directory, with a trailing separator.
  const char *base = SDL_GetBasePath();
  if (!base) return SDL_APP_FAILURE;
  smash_init((const uint8_t *)base, (int64_t)strlen(base));
  g_start = SDL_GetTicksNS();
  return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
  (void)appstate;
  double time = (double)(SDL_GetTicksNS() - g_start) / 1e9;
  return smash_frame(time) ? SDL_APP_CONTINUE : SDL_APP_SUCCESS;
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
  (void)appstate;
  df_handle_event(event);
  return event->type == SDL_EVENT_QUIT ? SDL_APP_SUCCESS : SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
  (void)appstate;
  (void)result;
  df_close();
}

// scriptc 0.2.0 library runtime: scr_bytes_io.o references the promise runtime, which library mode does not ship.
// Library mode has no async, so these are never reached.
void scr_promise_settled_ref(void) { SDL_assert_always(!"scriptc promise in library mode"); }
void scr_promise_settled_void(void) { SDL_assert_always(!"scriptc promise in library mode"); }
