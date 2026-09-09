import 'dotenv/config';
import app from './src/app';
const PORT = 3000;
app.listen(PORT, () => console.log(`Mi Cultivo (local) corriendo en http://localhost:${PORT}`));
