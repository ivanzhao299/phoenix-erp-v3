-- 为所有密码仍为占位符的真实用户设置初始密码（123456 的 bcrypt hash）
-- 幂等：只更新 password_hash = '$2b$10$placeholder' 的行，已改密的用户不受影响
-- 每个用户独立 salt，bcrypt cost=10

UPDATE sys_user SET password_hash = '$2b$10$sbeb3oM5rthWLgxmPwIK4.qo8ZL4UwRUzb.1RSGsAjvDk9YN7bnli', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'zhuzhaocun' AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$VarV9UavqIO/vZ80zYH6UuL5bo8mExyT31PPXl4MkJsnl0BMP5qzK', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'fuqiang'    AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$UcXLF8ynVDVr.oG8VxRhZeBsCHS6bvjpNBC9IGt/8SDVOX3arcx0K', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'wangweihua' AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$Q3g5hpO4wQ2QltGwuTdbDe3i4wc9Iqg8NtRWmD1uU.zHtLlpLKjSy', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'liuhantao'  AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$5R0XlAeQ2oS/liv9rjt4..VQQTrBEXKZZ/j9vAVclAnmqnmQYlz2C', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'zhuzhao_an' AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$FcsrMB27yT56Bt1PqwC1WeyKXVTUVxBI0U2VaN4O8tngAzF/ZVCcu', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'liushanjun' AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$Ynf4Ah34U2etqk0DK/CSQeJzTLzz6h4b7cH7Gdnf9Jx78Ex81GLfC', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'linhong'    AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$KysNvaPbJjSGyw8WcowNTuW02YH.bKNYPdVzsmqEbHuIBuKfr/CbC', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'amei'       AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$2T1dvFvG2iJ2tfZAa/.UF.phM53vnc5vnN5P7rCohR6umzJqHBsgW', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'zhuhuiran'  AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$rHAC9HDaxF5oedovS8UAuuMpOiwcjELTbFug8fq4BjvH.SuMp4WPq', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'yue'        AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$38ToV78uCYGCsxXWtFyoEemjAkJVXO7FKBozNMEK71DdDokpv5alK', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'wanglejin'  AND password_hash = '$2b$10$placeholder';

UPDATE sys_user SET password_hash = '$2b$10$X0uBosW850IDtAR68fb0CeTy.skffKsqRywSnew.XSuvAxKlTZBYu', updated_at = CURRENT_TIMESTAMP
  WHERE username = 'ajian'      AND password_hash = '$2b$10$placeholder';
