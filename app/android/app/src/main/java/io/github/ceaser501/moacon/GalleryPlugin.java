package io.github.ceaser501.moacon;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 갤러리에서 기프티콘 후보를 찾아오는 플러그인.
 *
 * 웹에는 기기의 사진 폴더를 훑는 방법이 없다. 브라우저가 그런 API를 주지 않기 때문이고,
 * 그래서 이 기능은 앱에만 있다. 여기서 하는 일은 딱 두 가지다.
 *
 *   1) 조건에 맞는 사진 "목록"을 준다 — 어느 폴더에, 언제 이후에 담긴 것인지.
 *   2) 그중 한 장을 "줄여서" 준다 — 바코드를 읽을 만큼만.
 *
 * 판단은 전부 화면 쪽(client/src/utils/gallery.js)이 한다. 바코드를 읽고, 이미 등록된
 * 것인지 가려내고, 사용자에게 물어보는 일이다. 네이티브는 웹이 못 하는 것만 맡는다 —
 * 고칠 일이 생겼을 때 APK를 다시 뿌려야 하는 코드는 적을수록 좋다.
 *
 * 사진은 원본 그대로 넘기지 않는다. 요즘 폰 사진은 한 장에 몇 MB인데, 바코드를 읽는 데는
 * 그만한 해상도가 필요 없다. 여기서 줄여 보내면 넘기는 양도, 웹뷰가 쓰는 메모리도 크게 준다.
 */
@CapacitorPlugin(
    name = "MoaconGallery",
    permissions = {
        // 안드로이드 13(API 33)부터는 사진 전용 권한을 따로 받는다.
        @Permission(alias = "media", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        // 12 이하에서는 저장소 읽기 권한 하나로 사진까지 함께 열린다.
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class GalleryPlugin extends Plugin {

    private static final int DEFAULT_LIMIT = 300;
    private static final int DEFAULT_MAX_EDGE = 1400;

    /**
     * 큰 정수는 문자열로 주고받는다.
     *
     * Capacitor의 call.getLong()은 값이 정확히 Long일 때만 돌려주고 아니면 기본값을 준다.
     * 그런데 자바스크립트에서 넘어온 숫자는 org.json이 파싱하는데, 32비트에 들어가는 값은
     * Integer가 된다. 사진 id도 기준 시각(초)도 대부분 그 범위라 getLong은 늘 null이었다.
     * 그래서 readImage가 사진을 한 장도 못 열었고, listImages의 since도 항상 0으로 떨어져
     * 매번 설치 시점부터 다시 훑고 있었다. 둘 다 조용히 실패해서 눈에 띄지 않았다.
     *
     * 문자열로 주고받으면 파서가 어떤 타입을 고르든 상관이 없다.
     */
    private static long parseLong(String text, long fallback) {
        if (text == null) return fallback;
        try {
            return Long.parseLong(text.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "storage";
    }

    private boolean hasFullAccess() {
        String name = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? Manifest.permission.READ_MEDIA_IMAGES
            : Manifest.permission.READ_EXTERNAL_STORAGE;
        return getContext().checkSelfPermission(name) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * 안드로이드 14부터는 "선택한 사진만 허용"이 생겼다. 이때는 사용자가 고른 몇 장만
     * 보이므로, 폴더를 훑는다는 전제가 성립하지 않는다. 화면 쪽에서 다르게 안내해야 해서
     * 전체 허용과 구분해 알려준다.
     */
    private boolean hasPartialAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false;
        return getContext().checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")
            == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * 훑기 기준선. 이 시각 이후에 담긴 사진만 본다.
     *
     * 설치 전부터 갤러리에 쌓여 있던 수천 장까지 뒤지면 느리고 대개 이미 쓴 것들이라,
     * 앱을 처음 깐 시점을 기준으로 삼는다. 다만 그 "시점"을 설치한 순간으로 잡으면
     * 안 된다 — 아침에 카카오톡으로 받아둔 기프티콘을 저녁에 앱을 깔고 찾으면
     * 하나도 안 나온다. 앱을 까는 이유가 바로 그것들을 넣으려는 것인데.
     *
     * 그래서 설치한 "날"의 0시로 내린다. 하루치가 더 들어올 뿐이라 느려지지 않고,
     * 화면에 적는 "8월 13일 이후에 담긴 사진만 봤어요"가 그제야 사실이 된다.
     */
    private long installedAtSeconds() {
        try {
            long millis = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0)
                .firstInstallTime;

            Calendar day = Calendar.getInstance();
            day.setTimeInMillis(millis);
            day.set(Calendar.HOUR_OF_DAY, 0);
            day.set(Calendar.MINUTE, 0);
            day.set(Calendar.SECOND, 0);
            day.set(Calendar.MILLISECOND, 0);
            return day.getTimeInMillis() / 1000L;
        } catch (Exception e) {
            return 0L;
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasFullAccess());
        result.put("partial", !hasFullAccess() && hasPartialAccess());
        result.put("installedAt", installedAtSeconds());
        call.resolve(result);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasFullAccess()) {
            getStatus(call);
            return;
        }
        requestPermissionForAlias(permissionAlias(), call, "accessResult");
    }

    @PermissionCallback
    private void accessResult(PluginCall call) {
        getStatus(call);
    }

    /**
     * 조건에 맞는 사진 목록. 파일 내용은 담지 않는다 — 목록만 먼저 주고, 실제로 읽을
     * 것은 화면 쪽이 한 장씩 요청한다. 수백 장을 통째로 넘기면 그것만으로 앱이 버겁다.
     *
     * buckets: 훑을 폴더 이름들(예: Download, KakaoTalk, Screenshots). 비우면 전체.
     *          폴더 이름은 제조사와 기기 언어에 따라 달라서 화면 쪽에서 정해 넘긴다.
     * since:   이 시각(초) 이후에 담긴 것만. 0이면 설치 시각을 기준으로 한다.
     */
    @PluginMethod
    public void listImages(PluginCall call) {
        if (!hasFullAccess() && !hasPartialAccess()) {
            call.reject("사진 접근 권한이 없어요.", "no_permission");
            return;
        }

        long since = parseLong(call.getString("since"), 0L);
        if (since <= 0L) since = installedAtSeconds();
        int limit = call.getInt("limit", DEFAULT_LIMIT);

        List<String> buckets = new ArrayList<>();
        JSArray raw = call.getArray("buckets", new JSArray());
        try {
            for (Object item : raw.toList()) {
                if (item != null) buckets.add(item.toString().toLowerCase(Locale.ROOT));
            }
        } catch (Exception ignored) {
            // 목록이 비면 폴더를 가리지 않고 전부 본다.
        }

        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME
        };

        JSArray images = new JSArray();
        // 기준 시각 이후에 담긴 사진이 어느 폴더에 몇 장씩 있는지. 우리가 고른 폴더만이
        // 아니라 전부 센다.
        //
        // 폴더 이름은 제조사·안드로이드 버전·앱 버전마다 다르다. 이름이 안 맞아서 못 찾는
        // 경우가 가장 흔한 실패인데, 이게 없으면 화면에서는 "사진이 없다"와 구분되지 않는다.
        // 실제 이름을 눈으로 보면 BUCKETS에 더해주기만 하면 된다.
        //
        // 우리가 실제로 본 폴더인지(used)도 함께 표시한다. 그게 없으면 목록에 뜬 이름을
        // 보고 "왜 저기까지 뒤지지"라고 읽게 된다 — 이건 기기에 무엇이 있는지의 목록이지
        // 우리가 훑은 목록이 아니다.
        LinkedHashMap<String, Integer> folderCounts = new LinkedHashMap<>();
        Set<String> usedFolders = new HashSet<>();
        ContentResolver resolver = getContext().getContentResolver();
        Cursor cursor = null;
        try {
            cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                MediaStore.Images.Media.DATE_ADDED + " >= ?",
                new String[] { String.valueOf(since) },
                MediaStore.Images.Media.DATE_ADDED + " DESC"
            );

            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int addedCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                int bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME);

                while (cursor.moveToNext()) {
                    String bucket = cursor.getString(bucketCol);

                    // 세는 건 끝까지 한다. 골라 담는 것만 상한에서 멈춘다 — 상한에 걸려
                    // 그만둔 것인지 폴더가 아예 없는 것인지 화면에서 구분해야 한다.
                    String label = bucket == null || bucket.isEmpty() ? "(이름 없음)" : bucket;
                    Integer seen = folderCounts.get(label);
                    folderCounts.put(label, seen == null ? 1 : seen + 1);

                    boolean matched = buckets.isEmpty() || matchesBucket(bucket, buckets);
                    if (matched) usedFolders.add(label);

                    if (!matched) continue;
                    if (images.length() >= limit) continue;

                    JSObject item = new JSObject();
                    // id는 문자열로 준다. 이 값이 그대로 readImage로 돌아오는데, 숫자로
                    // 주고받으면 Capacitor가 Integer로 파싱해 getLong이 못 읽는다.
                    item.put("id", String.valueOf(cursor.getLong(idCol)));
                    item.put("name", cursor.getString(nameCol));
                    item.put("addedAt", cursor.getLong(addedCol));
                    item.put("bucket", bucket == null ? "" : bucket);
                    images.put(item);
                }
            }
        } catch (Exception e) {
            call.reject("사진 목록을 읽지 못했어요: " + e.getMessage(), "list_failed");
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        JSObject result = new JSObject();
        result.put("images", images);
        result.put("partial", !hasFullAccess() && hasPartialAccess());
        // 실제로 어느 시각부터 봤는지. 화면에서 "언제 이후를 봤다"고 적어주려면 필요하다 —
        // 0을 넘겨 설치 시각으로 대신한 경우, 그 값을 아는 건 여기뿐이다.
        result.put("since", since);

        JSArray folders = new JSArray();
        for (Map.Entry<String, Integer> entry : folderCounts.entrySet()) {
            JSObject folder = new JSObject();
            folder.put("name", entry.getKey());
            folder.put("count", entry.getValue().intValue());
            folder.put("used", usedFolders.contains(entry.getKey()));
            folders.put(folder);
        }
        result.put("folders", folders);
        call.resolve(result);
    }

    /**
     * 폴더 이름 맞추기. 정확히 같은지 보지 않고 품고 있는지를 본다 — 같은 "스크린샷"이라도
     * 기기에 따라 Screenshots, Screenshot, 스크린샷으로 제각각이기 때문이다.
     */
    private boolean matchesBucket(String bucket, List<String> wanted) {
        if (bucket == null) return false;
        String lower = bucket.toLowerCase(Locale.ROOT);
        for (String item : wanted) {
            if (lower.contains(item) || item.contains(lower)) return true;
        }
        return false;
    }

    /**
     * 사진 한 장을 줄여서 돌려준다. 바코드를 읽을 만큼만 있으면 되므로 원본을 통째로
     * 넘기지 않는다. 두 번에 걸쳐 줄인다 — 먼저 디코딩하면서 대충(inSampleSize),
     * 그다음 정확히. 원본을 메모리에 통째로 펼치면 큰 사진에서 앱이 죽는다.
     */
    @PluginMethod
    public void readImage(PluginCall call) {
        long id = parseLong(call.getString("id"), -1L);
        if (id < 0L) {
            call.reject("사진 id가 없어요.", "no_id");
            return;
        }
        int maxEdge = call.getInt("maxEdge", DEFAULT_MAX_EDGE);

        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        ContentResolver resolver = getContext().getContentResolver();

        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            InputStream probe = resolver.openInputStream(uri);
            if (probe == null) {
                call.reject("사진을 열지 못했어요.", "open_failed");
                return;
            }
            try {
                BitmapFactory.decodeStream(probe, null, bounds);
            } finally {
                probe.close();
            }

            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            if (longest <= 0) {
                call.reject("사진을 읽지 못했어요.", "decode_failed");
                return;
            }

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            while (longest / opts.inSampleSize > maxEdge * 2) opts.inSampleSize *= 2;

            InputStream stream = resolver.openInputStream(uri);
            if (stream == null) {
                call.reject("사진을 열지 못했어요.", "open_failed");
                return;
            }
            Bitmap bitmap;
            try {
                bitmap = BitmapFactory.decodeStream(stream, null, opts);
            } finally {
                stream.close();
            }
            if (bitmap == null) {
                call.reject("사진을 읽지 못했어요.", "decode_failed");
                return;
            }

            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int edge = Math.max(width, height);
            if (edge > maxEdge) {
                float scale = (float) maxEdge / (float) edge;
                Bitmap scaled = Bitmap.createScaledBitmap(
                    bitmap, Math.round(width * scale), Math.round(height * scale), true);
                if (scaled != bitmap) bitmap.recycle();
                bitmap = scaled;
            }

            // 화질을 아끼지 않는다(85 → 95).
            //
            // 이 사본은 바코드를 읽는 데만 쓰이는 게 아니다. 등록에 넘길 때 모델이 보는
            // 그림이 되기도 하는데, 웹에서 한 번 더 줄여 보내므로 눌린 자국 위에 또 눌린다.
            // 한글은 획 하나로 갈려서(떠/따, 반/밤) 그 한 겹이 상품명을 지운다 — 같은
            // 쿠폰이 직접 올리면 읽히고 훑으면 못 읽혔다.
            //
            // 파일이 커지지만 폰 안에서만 오가고, 모델 요금은 픽셀 수로만 매겨져 그대로다.
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out);
            int outWidth = bitmap.getWidth();
            int outHeight = bitmap.getHeight();
            bitmap.recycle();

            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            result.put("width", outWidth);
            result.put("height", outHeight);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("사진을 읽지 못했어요: " + e.getMessage(), "read_failed");
        } catch (OutOfMemoryError e) {
            // 아주 큰 사진에서 날 수 있다. 한 장 때문에 스캔 전체가 멈추지는 않게 한다.
            call.reject("사진이 너무 커서 건너뛰었어요.", "too_large");
        }
    }
}
