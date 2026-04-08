import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 환경 변수 파일 위치 (src 상위의 setting 폴더)
  envDir: resolve(__dirname, '../setting'), 
  
  // 프로젝트 루트를 src로 설정
  root: resolve(__dirname, 'src'), 
  
  plugins: [
    {
      name: 'rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/html/index.html';
          }
          next();
        });
      }
    }
  ],
  
  build: {
    // outDir은 root(src) 기준이므로, 다시 상위로 나가서 dist를 생성해야 함
    outDir: resolve(__dirname, 'dist'), 
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // root가 src이므로, src 내부의 경로만 작성합니다.
        main: resolve(__dirname, 'src/html/index.html'),
        map: resolve(__dirname, 'src/html/map.html')
      }
    }
  }
});